"""ChatKit server that streams responses from a single assistant."""

from __future__ import annotations

import base64
import os
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


MAX_THREADS = int(os.getenv("OPENAI_MAX_THREADS", "30"))
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


def delete_generated_files_for_thread(thread_id: str) -> None:
    for file_id, (path, _, generated_thread_id) in list(GENERATED_FILES.items()):
        if generated_thread_id == thread_id:
            path.unlink(missing_ok=True)
            GENERATED_FILES.pop(file_id, None)


def delete_all_generated_files() -> None:
    for path, _, _ in list(GENERATED_FILES.values()):
        path.unlink(missing_ok=True)
    GENERATED_FILES.clear()


assistant_agent = Agent[AgentContext[dict[str, Any]]](
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
    instructions=AGENT_INSTRUCTIONS,
)

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
            limit=MAX_THREADS,
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

        result = Runner.run_streamed(
            assistant_agent,
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
