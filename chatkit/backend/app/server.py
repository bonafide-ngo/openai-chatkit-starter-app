"""ChatKit server that streams responses from a single assistant."""

from __future__ import annotations

from typing import Any, AsyncIterator

import base64
from pathlib import Path

from agents import Agent, CodeInterpreterTool, Runner, WebSearchTool
from chatkit.agents import AgentContext, simple_to_agent_input, stream_agent_response, ThreadItemConverter
from chatkit.server import ChatKitServer
from chatkit.types import ThreadMetadata, ThreadStreamEvent, UserMessageItem, Attachment, ImageAttachment

from .attachment_store import MemoryAttachmentStore
from .memory_store import MemoryStore


MAX_RECENT_ITEMS = 30
MODEL = "gpt-5.6-luna"


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
    ],
    instructions=(
        "You are a concise, helpful assistant. "
        "Use web search when the user asks for current or up-to-date information. "
        "Use the code interpreter when calculations, data analysis, "
        "Python execution, or generating/analyzing data would be useful. "
        "When the user uploads a file, inspect and analyze it when relevant."
    ),
)

class StarterAttachmentConverter(ThreadItemConverter):
    async def attachment_to_message_content(
        self,
        attachment: Attachment,
    ):
        path = Path("/tmp/chatkit-uploads") / attachment.id

        if not path.exists():
            raise FileNotFoundError(f"Uploaded file not found: {path}")

        data = base64.b64encode(path.read_bytes()).decode("utf-8")

        if isinstance(attachment, ImageAttachment):
            return {
                "type": "input_image",
                "image_url": f"data:{attachment.mime_type};base64,{data}",
            }

        return {
            "type": "input_file",
            "filename": attachment.name,
            "file_data": f"data:{attachment.mime_type};base64,{data}",
        }

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

    def __init__(self) -> None:
        self.store = MemoryStore()
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
     
        print("CHATKIT ITEMS:")
        for chat_item in items:
          print(chat_item)

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

        #async for event in stream_agent_response(agent_context, result):
        #    yield event

        try:
            async for event in stream_agent_response(agent_context, result):
                yield event
        except ValueError as e:
            if "AnnotationFilePath" not in str(e):
                raise
