"""FastAPI entrypoint for the ChatKit starter backend."""

from __future__ import annotations

import os
import json
import re
import tempfile
from contextlib import asynccontextmanager
from typing import Any
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env.local")

from chatkit.server import StreamingResult
from chatkit.store import NotFoundError
from fastapi import File, FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
import httpx
from agents.mcp import MCPServerManager
from pydantic import BaseModel, Field

from .attachment_store import MAX_ATTACHMENT_BYTES, UPLOAD_DIR
from .memory_store import EphemeralStore
from .export import build_docx, build_markdown, build_pdf, conversation_rows, export_text
from .server import GENERATED_FILES, StarterChatServer, configured_mcp_server
from .user_store import UserUsageStore
from .vector_store import (
    configured_vector_store_ids,
    delete_vector_store_file,
    list_vector_store_files,
    require_vector_store,
    store_label,
    upload_and_replace,
)
from openai import AsyncOpenAI


@asynccontextmanager
async def app_lifespan(application: FastAPI):
    application.state.mcp_configurations = {}
    server = configured_mcp_server()
    async with MCPServerManager([server] if server else [], strict=False) as mcp_manager:
        application.state.mcp_manager = mcp_manager
        yield


app = FastAPI(title="ChatKit Starter API", lifespan=app_lifespan)


class MCPConfiguration(BaseModel):
    enabled: bool = False
    name: str = Field(default="Configured MCP server", max_length=200)
    transport: str = Field(default="streamable-http", pattern="^(streamable-http|sse|stdio)$")
    url: str = Field(default="", max_length=2000)
    command: str = Field(default="", max_length=200)
    arguments: str = Field(default="", max_length=4000)
    authToken: str = Field(default="", max_length=4000)


def default_mcp_config() -> dict[str, Any]:
    return {
        "enabled": os.getenv("MCP_ENABLED", "false").strip().lower() == "true",
        "name": os.getenv("MCP_SERVER_NAME", "Configured MCP server"),
        "transport": os.getenv("MCP_TRANSPORT", "streamable-http"),
        "url": os.getenv("MCP_SERVER_URL", ""),
        "command": os.getenv("MCP_SERVER_COMMAND", ""),
        "arguments": os.getenv("MCP_SERVER_ARGS", ""),
        "authToken": "",
    }


@app.get("/chatkit/mcp/config")
async def get_mcp_config(request: Request) -> dict[str, Any]:
    config = request.app.state.mcp_configurations.get(request.state.user_id)
    return config or default_mcp_config()


@app.put("/chatkit/mcp/config")
async def set_mcp_config(config: MCPConfiguration, request: Request) -> dict[str, str]:
    if config.enabled and config.transport != "stdio" and not config.url.strip():
        raise HTTPException(status_code=422, detail="MCP server URL is required when MCP is enabled.")
    if config.enabled and config.transport == "stdio":
        raise HTTPException(status_code=422, detail="stdio MCP servers must be configured by the server administrator.")
    request.app.state.mcp_configurations[request.state.user_id] = config.model_dump()
    return {"status": "saved"}


@app.delete("/chatkit/mcp/config")
async def reset_mcp_config(request: Request) -> dict[str, str]:
    request.app.state.mcp_configurations.pop(request.state.user_id, None)
    return {"status": "reset"}
APP_TITLE = os.getenv("CHATKIT_APP_TITLE", "ChatKit")
MAINTENANCE_MODE = os.getenv("CHATKIT_MAINTENANCE", "false").strip().lower() == "true"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CHATKIT_ALLOWED_ORIGINS",
            "http://127.0.0.1:3000,http://localhost:3000,https://cdn.platform.openai.com",
        ).split(",")
        if origin.strip()
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def allow_private_network_preflight(request: Request, call_next):
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

chatkit_server = StarterChatServer()
temporary_chatkit_server = StarterChatServer(
    store=EphemeralStore()
)


@app.middleware("http")
async def require_authentication(request: Request, call_next):
    if request.url.path in {"/health", "/docs", "/openapi.json", "/redoc"} or request.method == "OPTIONS":
        return await call_next(request)
    if MAINTENANCE_MODE:
        return JSONResponse({"detail": "The system is temporarily unavailable for maintenance."}, status_code=503)
    auth_url = os.getenv("AUTH_INTERNAL_URL", "http://127.0.0.1:3001/api/auth/session")
    try:
        # Forward the browser cookie to the internal auth service, while keeping
        # the service-to-service secret out of the browser-facing request.
        async with httpx.AsyncClient(timeout=2.0) as client:
            auth_response = await client.get(auth_url, headers={
                "cookie": request.headers.get("cookie", ""),
                "x-internal-auth": os.getenv("AUTH_INTERNAL_SECRET", ""),
            })
    except httpx.HTTPError:
        return JSONResponse({"detail": "Authentication service unavailable"}, status_code=503)
    try:
        auth_payload = auth_response.json()
    except ValueError:
        auth_payload = None
    if not isinstance(auth_payload, dict):
        auth_payload = {}
    user = auth_payload.get("user")
    email = user.get("email") if isinstance(user, dict) else None
    if auth_response.status_code != 200 or not user or not isinstance(email, str) or not email.strip():
        return JSONResponse({"detail": "Authentication required"}, status_code=401)
    request.state.user_id = email.strip().lower()
    return await call_next(request)


@app.get("/health")
async def health() -> dict[str, bool | str]:
    mcp_manager = getattr(app.state, "mcp_manager", None)
    return {
        "status": "ok",
        "maintenance": MAINTENANCE_MODE,
        "mcp_configured": configured_mcp_server() is not None,
        "mcp_active": bool(mcp_manager and mcp_manager.active_servers),
    }


@app.get("/chatkit/usage")
async def get_usage(request: Request) -> dict[str, Any]:
    return UserUsageStore().usage_snapshot(request.state.user_id)


def vector_store_client() -> AsyncOpenAI:
    return AsyncOpenAI()


async def process_chatkit_request(
    request: Request,
    server: StarterChatServer,
) -> Response:
    """Proxy the ChatKit web component payload to the server implementation."""
    payload = await request.body()
    try:
        result = await server.process(
            payload, {"request": request, "user_id": request.state.user_id}
        )
    except NotFoundError:
        try:
            parsed_payload = json.loads(payload)
        except (json.JSONDecodeError, UnicodeDecodeError):
            parsed_payload = {}

        if parsed_payload.get("type") == "threads.get_by_id":
            thread_id = parsed_payload.get("params", {}).get("thread_id")
            if isinstance(thread_id, str):
                await server.store.delete_thread(
                    thread_id,
                    {"request": request, "user_id": request.state.user_id},
                )
                return JSONResponse(
                    {"error": "The requested chat was unavailable and was removed from history."},
                    status_code=404,
                )
        raise

    if isinstance(result, StreamingResult):
        return StreamingResponse(result, media_type="text/event-stream")

    if hasattr(result, "json"):
        return Response(content=result.json, media_type="application/json")

    return JSONResponse(result)


@app.post("/chatkit")
async def chatkit_endpoint(request: Request) -> Response:
    return await process_chatkit_request(request, chatkit_server)


@app.post("/chatkit/temporary")
async def temporary_chatkit_endpoint(request: Request) -> Response:
    return await process_chatkit_request(request, temporary_chatkit_server)


async def export_thread(thread_id: str, extension: str, request: Request, locale: str) -> Response:
    server = temporary_chatkit_server if request.url.path.startswith("/chatkit/temporary") else chatkit_server
    context = {"request": request, "user_id": request.state.user_id}
    thread = await server.store.load_thread(thread_id, context)
    items_page = await server.store.load_thread_items(
        thread_id,
        after=None,
        limit=10000,
        order="asc",
        context=context,
    )
    labels = export_text(locale)
    title = thread.title or labels["chat_export"]
    rows = conversation_rows(thread, items_page.data, locale)
    exported_at = datetime.now(timezone.utc)
    if extension == "pdf":
        output = build_pdf(APP_TITLE, title, rows, exported_at, locale)
        media_type = "application/pdf"
    elif extension == "docx":
        output = build_docx(APP_TITLE, title, rows, exported_at, locale)
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        output = build_markdown(APP_TITLE, title, rows, exported_at, locale)
        media_type = "text/markdown; charset=utf-8"
    filename = f"chat-{thread_id}.{extension}"
    return Response(
        content=output.getvalue(),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/chatkit/threads/{thread_id}/export/{extension}")
async def export_persistent_thread(thread_id: str, extension: str, request: Request, locale: str = "en") -> Response:
    if extension not in {"pdf", "docx", "md"}:
        raise HTTPException(status_code=400, detail="Unsupported export format")
    return await export_thread(thread_id, extension, request, locale)


@app.get("/chatkit/temporary/threads/{thread_id}/export/{extension}")
async def export_temporary_thread(thread_id: str, extension: str, request: Request, locale: str = "en") -> Response:
    if extension not in {"pdf", "docx", "md"}:
        raise HTTPException(status_code=400, detail="Unsupported export format")
    return await export_thread(thread_id, extension, request, locale)


@app.delete("/chatkit/threads")
async def delete_all_threads(request: Request) -> Response:
    await chatkit_server.store.delete_all(
        {"request": request, "user_id": request.state.user_id}
    )
    return Response(status_code=204)


@app.get("/chatkit/knowledge-base/stores")
async def list_configured_vector_stores() -> list[dict[str, str]]:
    client = vector_store_client()
    stores = []
    for vector_store_id in configured_vector_store_ids():
        stores.append(
            {
                "id": vector_store_id,
                "name": await store_label(client, vector_store_id),
            }
        )
    return stores


@app.get("/chatkit/knowledge-base/stores/{vector_store_id}/files")
async def list_knowledge_base_files(vector_store_id: str) -> list[dict]:
    require_vector_store(vector_store_id)
    return await list_vector_store_files(vector_store_client(), vector_store_id)


@app.post("/chatkit/knowledge-base/stores/{vector_store_id}/files")
async def upload_knowledge_base_file(
    vector_store_id: str,
    file: UploadFile = File(...),
) -> dict:
    require_vector_store(vector_store_id)
    return await upload_and_replace(vector_store_client(), vector_store_id, file)


@app.delete("/chatkit/knowledge-base/stores/{vector_store_id}/files/{file_id}")
async def delete_knowledge_base_file(vector_store_id: str, file_id: str) -> Response:
    require_vector_store(vector_store_id)
    await delete_vector_store_file(vector_store_client(), vector_store_id, file_id)
    return Response(status_code=204)


@app.delete("/chatkit/knowledge-base/stores/{vector_store_id}/files")
async def delete_all_knowledge_base_files(vector_store_id: str) -> Response:
    require_vector_store(vector_store_id)
    client = vector_store_client()
    files = await list_vector_store_files(client, vector_store_id)
    for file in files:
        await delete_vector_store_file(client, vector_store_id, file["id"])
    return Response(status_code=204)


UPLOAD_DIR = Path("/tmp/chatkit-uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@app.put("/chatkit/uploads/{attachment_id}")
async def upload_attachment(
    attachment_id: str,
    request: Request,
) -> Response:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", attachment_id):
        raise HTTPException(status_code=400, detail="Invalid attachment ID")

    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared_size = int(content_length)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid Content-Length") from exc
        if declared_size < 0 or declared_size > MAX_ATTACHMENT_BYTES:
            raise HTTPException(status_code=413, detail="Attachment is too large")

    path = UPLOAD_DIR / attachment_id
    temporary_path = None
    bytes_written = 0

    try:
        # Content-Length is only an early rejection. Streaming still enforces the
        # limit because chunked requests can omit or falsify that header.
        with tempfile.NamedTemporaryFile(
            dir=UPLOAD_DIR,
            prefix=f".{attachment_id}.",
            delete=False,
        ) as output:
            temporary_path = output.name
            async for chunk in request.stream():
                bytes_written += len(chunk)
                if bytes_written > MAX_ATTACHMENT_BYTES:
                    raise HTTPException(status_code=413, detail="Attachment is too large")
                output.write(chunk)

        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None:
            Path(temporary_path).unlink(missing_ok=True)

    return Response(status_code=204)


@app.get("/chatkit/uploads/{attachment_id}")
async def get_attachment(attachment_id: str) -> FileResponse:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", attachment_id):
        raise HTTPException(status_code=400, detail="Invalid attachment ID")

    path = (UPLOAD_DIR / attachment_id).resolve()
    if path.parent != UPLOAD_DIR.resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="Attachment not found")

    attachment = chatkit_server.attachment_store.attachments.get(attachment_id)
    media_type = attachment.mime_type if attachment is not None else None
    return FileResponse(path, media_type=media_type)


@app.get("/chatkit/generated/{file_id}")
async def get_generated_file(file_id: str) -> FileResponse:
    if not re.fullmatch(r"[A-Za-z0-9]{32}", file_id):
        raise HTTPException(status_code=400, detail="Invalid generated file ID")

    generated_file = GENERATED_FILES.get(file_id)
    if generated_file is None:
        raise HTTPException(status_code=404, detail="Generated file not found")

    path, filename, _ = generated_file
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Generated file not found")

    return FileResponse(path, filename=filename)
