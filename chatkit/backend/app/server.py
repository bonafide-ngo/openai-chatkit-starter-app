"""ChatKit server that streams responses from a single assistant."""

from __future__ import annotations

import base64
import os
import shlex
from pathlib import Path
from typing import Any, AsyncIterator
from uuid import uuid4

from agents import (
    Agent,
    CodeInterpreterTool,
    FileSearchTool,
    RawResponsesStreamEvent,
    Runner,
    WebSearchTool,
)
from agents.mcp import (
    MCPServer,
    MCPServerManager,
    MCPServerSse,
    MCPServerStdio,
    MCPServerStreamableHttp,
)
from chatkit.agents import (
    AgentContext,
    ResponseStreamConverter,
    simple_to_agent_input,
    stream_agent_response,
    ThreadItemConverter,
)
from chatkit.server import ChatKitServer
from chatkit.types import (
    Annotation,
    Attachment,
    ImageAttachment,
    ThreadMetadata,
    ThreadStreamEvent,
    URLSource,
    UserMessageItem,
)
from openai import AsyncOpenAI

from .attachment_store import (
    MAX_ATTACHMENT_BYTES,
    UPLOAD_DIR,
    MemoryAttachmentStore,
    public_base_url,
)
from .memory_store import MemoryStore


MAX_RECENT_ITEMS = 30
MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
AGENT_INSTRUCTIONS = os.getenv(
    "OPENAI_AGENT_INSTRUCTIONS",
    "You are a concise, helpful assistant. "
    "Use web search when the user asks for current or up-to-date information. "
    "Use the code interpreter when calculations, data analysis, "
    "Python execution, or generating/analyzing data would be useful. "
    "When the user uploads a file, inspect and analyze it when relevant. "
    "When you create a file for the user, include a Markdown download link "
    "using the exact sandbox:/mnt/data/<filename> URL returned by the tool. "
    "Do not add any other links for that file.",
)
MCP_AGENT_INSTRUCTIONS = (
    "When MCP tools are available, treat them as available capabilities. "
    "Use an MCP tool when it is relevant to the user's request, and do not "
    "claim that MCP is unavailable if an MCP tool is listed for this run."
)
VECTOR_STORE_IDS = [
    vector_store_id.strip()
    for vector_store_id in os.getenv("OPENAI_VECTOR_STORE_IDS", "").split(",")
    if vector_store_id.strip()
]
TEXT_FILE_MIME_TYPES = {
    "text/x-python-script",
    "text/x-python",
    "application/javascript",
    "text/javascript",
    "application/x-javascript",
}
GENERATED_FILE_DIR = Path("/tmp/chatkit-generated-files")
GENERATED_FILE_DIR.mkdir(parents=True, exist_ok=True)
GENERATED_FILES: dict[str, tuple[Path, str, str | None]] = {}


def _mcp_approval_policy() -> str:
    policy = os.getenv("MCP_REQUIRE_APPROVAL", "never").strip().lower()
    return policy if policy in {"always", "never"} else "never"


def _mcp_timeout_seconds() -> float:
    try:
        return max(5.0, float(os.getenv("MCP_CLIENT_TIMEOUT_SECONDS", "30")))
    except ValueError:
        return 30.0


def configured_mcp_server(settings: dict[str, Any] | None = None) -> MCPServer | None:
    if settings is None:
        settings = {
            "enabled": os.getenv("MCP_ENABLED", "false"),
            "transport": os.getenv("MCP_TRANSPORT", "streamable-http"),
            "name": os.getenv("MCP_SERVER_NAME", "Configured MCP server"),
            "url": os.getenv("MCP_SERVER_URL", ""),
            "command": os.getenv("MCP_SERVER_COMMAND", ""),
            "arguments": os.getenv("MCP_SERVER_ARGS", ""),
            "authToken": os.getenv("MCP_AUTH_TOKEN", ""),
        }

    def value(key: str, default: str = "") -> str:
        configured = settings.get(key)
        return str(configured) if configured is not None else os.getenv(key, default)

    if value("enabled", "false").strip().lower() != "true":
        return None

    transport = value("transport", "streamable-http").strip().lower()
    name = value("name", "Configured MCP server").strip()
    approval = _mcp_approval_policy()

    if transport in {"streamable-http", "http"}:
        url = value("url").strip()
        if not url:
            return None
        headers = {}
        token = value("authToken").strip()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return MCPServerStreamableHttp(
            params={"url": url, "headers": headers},
            cache_tools_list=False,
            name=name,
            client_session_timeout_seconds=_mcp_timeout_seconds(),
            require_approval=approval,
        )

    if transport == "sse":
        url = value("url").strip()
        if not url:
            return None
        headers = {}
        token = value("authToken").strip()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return MCPServerSse(
            params={"url": url, "headers": headers},
            cache_tools_list=False,
            name=name,
            client_session_timeout_seconds=_mcp_timeout_seconds(),
            require_approval=approval,
        )

    if transport == "stdio":
        command = value("command", "").strip()
        if not command:
            return None
        arguments = shlex.split(value("arguments", ""))
        return MCPServerStdio(
            params={"command": command, "args": arguments},
            cache_tools_list=False,
            name=name,
            require_approval=approval,
        )

    return None


def delete_generated_files_for_thread(thread_id: str) -> None:
    for file_id, (path, _, generated_thread_id) in list(GENERATED_FILES.items()):
        if generated_thread_id == thread_id:
            path.unlink(missing_ok=True)
            GENERATED_FILES.pop(file_id, None)


def delete_all_generated_files() -> None:
    for path, _, _ in list(GENERATED_FILES.values()):
        path.unlink(missing_ok=True)
    GENERATED_FILES.clear()


def build_assistant_agent(
    mcp_server: MCPServer | None = None,
) -> Agent[AgentContext[dict[str, Any]]]:
    active_servers = [mcp_server] if mcp_server else []
    mcp_instructions = MCP_AGENT_INSTRUCTIONS
    if active_servers:
        server_name = active_servers[0].name
        mcp_instructions = (
            f"{MCP_AGENT_INSTRUCTIONS} There is one active MCP server: {server_name}. "
            "When a request falls within an active MCP server's scope, use its MCP "
            "tools before web search, file search, or general model knowledge. "
            "When you use an MCP tool, clearly inform the user in your final answer "
            f"that the relevant information came from the MCP server '{server_name}'. "
            "If you combine MCP with other sources, like web search, file search, "
            "or general model knowledge, explain that naturally as well. Do not "
            "claim or imply that information came from MCP if you did not call an "
            "MCP tool."
        )

    return Agent[AgentContext[dict[str, Any]]](
        model=MODEL,
        name="Starter Assistant",
        tools=[
            WebSearchTool(),
            CodeInterpreterTool(
                tool_config={
                    "type": "code_interpreter",
                    "container": {
                        "type": "auto",
                    },
                }
            ),
        ]
        + ([FileSearchTool(vector_store_ids=VECTOR_STORE_IDS)] if VECTOR_STORE_IDS else []),
        mcp_servers=active_servers,
        instructions=f"{AGENT_INSTRUCTIONS}\n\n{mcp_instructions}",
    )


assistant_agent = build_assistant_agent()

class StarterAttachmentConverter(ThreadItemConverter):
    @staticmethod
    def _file_mime_type(attachment: Attachment) -> str:
        mime_type = attachment.mime_type.split(";", 1)[0].lower()
        if mime_type in TEXT_FILE_MIME_TYPES:
            return "text/plain"
        return mime_type

    async def attachment_to_message_content(
        self,
        attachment: Attachment,
    ):
        path = (UPLOAD_DIR / attachment.id).resolve()

        if path.parent != UPLOAD_DIR.resolve() or not path.is_file():
            raise FileNotFoundError(f"Uploaded file not found: {path}")

        if path.stat().st_size > MAX_ATTACHMENT_BYTES:
            raise ValueError("Uploaded file exceeds the configured size limit")

        data = base64.b64encode(path.read_bytes()).decode("utf-8")

        if isinstance(attachment, ImageAttachment):
            return {
                "type": "input_image",
                "image_url": f"data:{attachment.mime_type};base64,{data}",
            }

        mime_type = self._file_mime_type(attachment)
        return {
            "type": "input_file",
            "filename": attachment.name,
            "file_data": f"data:{mime_type};base64,{data}",
        }


class StarterResponseStreamConverter(ResponseStreamConverter):
    def __init__(self, context: dict[str, Any]) -> None:
        self.context = context
        self.openai_client = AsyncOpenAI()
        self.generated_file_ids: dict[str, str] = {}

    async def prepare_container_file(self, citation) -> None:
        filename = citation.filename or "generated-file"
        file_id = uuid4().hex
        path = GENERATED_FILE_DIR / file_id
        content = await self.openai_client.containers.files.content.retrieve(
            citation.file_id,
            container_id=citation.container_id,
        )
        file_bytes = content.read()
        path.write_bytes(file_bytes)
        GENERATED_FILES[file_id] = (
            path,
            filename,
            self.context.get("thread_id"),
        )
        self.generated_file_ids[citation.file_id] = file_id

    async def container_file_citation_to_annotation(self, citation):
        await self.prepare_container_file(citation)
        filename = citation.filename or "generated-file"
        base_url = public_base_url(self.context)
        if base_url is None:
            request = self.context.get("request")
            base_url = str(request.base_url).rstrip("/") if request else ""
        return Annotation(
            source=URLSource(
                url=(
                    f"{base_url}/chatkit/generated/"
                    f"{self.generated_file_ids[citation.file_id]}"
                ),
                title=f"Download {filename}",
            ),
            index=citation.end_index,
        )


class AnnotationCompatibleResult:
    def __init__(self, result, converter: StarterResponseStreamConverter) -> None:
        self.result = result
        self.converter = converter

    async def stream_events(self):
        async for event in self.result.stream_events():
            if event.type == "raw_response_event":
                response_event = event.data
            if (
                event.type == "raw_response_event"
                and event.data.type == "response.output_text.annotation.added"
                and hasattr(event.data.annotation, "model_dump")
            ):
                event = RawResponsesStreamEvent(
                    data=event.data.model_copy(
                        update={"annotation": event.data.annotation.model_dump()}
                    ),
                    type=event.type,
                )
            yield event

def make_thread_title(item: UserMessageItem | None) -> str:
    if item is None:
        return "New thread"

    # Extract text from the user's message.
    text_parts = []

    for content in item.content:
        if getattr(content, "type", None) == "input_text":
            text_parts.append(getattr(content, "text", ""))

    text = " ".join(text_parts).strip()

    if not text:
        return "New thread"

    # Collapse whitespace.
    text = " ".join(text.split())

    # Keep titles short enough for the History list.
    if len(text) > 60:
        text = text[:60].rsplit(" ", 1)[0] + "…"

    return text

class StarterChatServer(ChatKitServer[dict[str, Any]]):
    """Server implementation that keeps conversation state in memory."""

    def __init__(self, store: MemoryStore | None = None) -> None:
        self.store = store or MemoryStore(
            cleanup_thread_files=delete_generated_files_for_thread
        )
        self.attachment_store = MemoryAttachmentStore()

        super().__init__(
            store=self.store,
            attachment_store=self.attachment_store,
        )

    async def respond(
        self,
        thread: ThreadMetadata,
        item: UserMessageItem | None,
        context: dict[str, Any],
    ) -> AsyncIterator[ThreadStreamEvent]:

        if item is not None and not thread.title:
            thread.title = make_thread_title(item)
            await self.store.save_thread(thread, context)

        items_page = await self.store.load_thread_items(
            thread.id,
            after=None,
            limit=MAX_RECENT_ITEMS,
            order="desc",
            context=context,
        )

        items = list(reversed(items_page.data))
     
        converter = StarterAttachmentConverter()
        agent_input = await converter.to_agent_input(items)

        agent_context = AgentContext(
            thread=thread,
            store=self.store,
            request_context=context,
        )

        request = context.get("request")
        app_state = getattr(getattr(request, "app", None), "state", None)
        user_config = app_state.mcp_configurations.get(context.get("user_id")) if app_state else None
        user_mcp_server = configured_mcp_server(user_config) if user_config else None
        default_manager = getattr(app_state, "mcp_manager", None)

        async with MCPServerManager([user_mcp_server] if user_mcp_server else []) as user_manager:
            active_server = user_manager.active_servers[0] if user_manager.active_servers else None
            if active_server is None and default_manager is not None and default_manager.active_servers:
                active_server = default_manager.active_servers[0]
            agent = build_assistant_agent(active_server)
            result = Runner.run_streamed(
                agent,
                agent_input,
                context=agent_context,
            )

            response_converter = StarterResponseStreamConverter(
                {**context, "thread_id": thread.id}
            )
            async for event in stream_agent_response(
                agent_context,
                AnnotationCompatibleResult(result, response_converter),
                converter=response_converter,
            ):
                yield event
