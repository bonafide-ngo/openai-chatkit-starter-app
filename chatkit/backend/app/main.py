"""FastAPI entrypoint for the ChatKit starter backend."""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path

from chatkit.server import StreamingResult
from fastapi import File, FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

from .attachment_store import MAX_ATTACHMENT_BYTES, UPLOAD_DIR
from .memory_store import EphemeralStore
from .server import GENERATED_FILES, StarterChatServer, delete_all_generated_files
from .vector_store import (
    configured_vector_store_ids,
    delete_vector_store_file,
    list_vector_store_files,
    require_vector_store,
    store_label,
    upload_and_replace,
)
from chatkit.types import AttachmentCreateParams
from openai import AsyncOpenAI


app = FastAPI(title="ChatKit Starter API")

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
    allow_credentials=False,
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


def vector_store_client() -> AsyncOpenAI:
    return AsyncOpenAI()


async def process_chatkit_request(
    request: Request,
    server: StarterChatServer,
) -> Response:
    """Proxy the ChatKit web component payload to the server implementation."""
    payload = await request.body()
    result = await server.process(payload, {"request": request})

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


@app.delete("/chatkit/threads")
async def delete_all_threads(request: Request) -> Response:
    await chatkit_server.store.delete_all({"request": request})
    delete_all_generated_files()
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


@app.post("/chatkit/local-uploads")
async def upload_local_file(request: Request) -> dict:
    filename = request.headers.get("x-filename", "uploaded-file")
    mime_type = request.headers.get("content-type", "application/octet-stream")
    content = await request.body()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(content) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="Attachment is too large")

    attachment = await chatkit_server.attachment_store.create_attachment(
        AttachmentCreateParams(name=filename, mime_type=mime_type),
        {"request": request},
    )
    (UPLOAD_DIR / attachment.id).write_bytes(content)
    return attachment.model_dump(mode="json")

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
