"""
Simple in-memory store compatible with the ChatKit Store interface.
A production app would implement this using a persistant database.
"""

from __future__ import annotations

from collections import defaultdict
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from chatkit.store import NotFoundError, Store
from chatkit.types import Attachment, Page, ThreadItem, ThreadMetadata
from pydantic import TypeAdapter

UPLOAD_DIR = Path("/tmp/chatkit-uploads")
DEFAULT_STORE_PATH = Path(__file__).resolve().parents[1] / ".data" / "chatkit-store.json"
THREAD_ITEM_ADAPTER = TypeAdapter(ThreadItem)
ATTACHMENT_ADAPTER = TypeAdapter(Attachment)

class MemoryStore(Store[dict]):
    def __init__(self, cleanup_thread_files=None):
        self.threads: dict[str, ThreadMetadata] = {}
        self.items: dict[str, list[ThreadItem]] = defaultdict(list)
        self.attachments: dict[str, Attachment] = {}
        self.cleanup_thread_files = cleanup_thread_files
        self.path = Path(os.getenv("CHATKIT_STORE_PATH", str(DEFAULT_STORE_PATH)))
        self._load()

    async def load_thread(self, thread_id: str, context: dict) -> ThreadMetadata:
        if thread_id not in self.threads:
            raise NotFoundError(f"Thread {thread_id} not found")
        return self.threads[thread_id]

    async def save_thread(self, thread: ThreadMetadata, context: dict) -> None:
        metadata = ThreadMetadata.model_validate(
            thread.model_dump(exclude={"items"})
        )
        self.threads[metadata.id] = metadata
        self._persist()

    async def load_threads(
        self, limit: int, after: str | None, order: str, context: dict
    ) -> Page[ThreadMetadata]:
        threads = list(self.threads.values())
        return self._paginate(
            threads,
            after,
            limit,
            order,
            sort_key=lambda t: t.created_at,
            cursor_key=lambda t: t.id,
        )

    async def load_thread_items(
        self, thread_id: str, after: str | None, limit: int, order: str, context: dict
    ) -> Page[ThreadItem]:
        items = self.items.get(thread_id, [])
        return self._paginate(
            items,
            after,
            limit,
            order,
            sort_key=lambda i: i.created_at,
            cursor_key=lambda i: i.id,
        )

    async def add_thread_item(
        self, thread_id: str, item: ThreadItem, context: dict
    ) -> None:
        self.items[thread_id].append(item)
        self._persist()

    async def save_attachment(
        self,
        attachment: Attachment,
        context: dict,
    ) -> None:
        self.attachments[attachment.id] = attachment
        self._persist()

    async def load_attachment(
        self,
        attachment_id: str,
        context: dict,
    ) -> Attachment:
        if attachment_id not in self.attachments:
            raise NotFoundError(
                f"Attachment {attachment_id} not found"
            )

        return self.attachments[attachment_id]

    async def delete_attachment(
        self,
        attachment_id: str,
        context: dict,
    ) -> None:
        self.attachments.pop(attachment_id, None)
        self._persist()

    async def save_item(self, thread_id: str, item: ThreadItem, context: dict) -> None:
        items = self.items[thread_id]
        for idx, existing in enumerate(items):
            if existing.id == item.id:
                items[idx] = item
                self._persist()
                return
        items.append(item)
        self._persist()

    async def load_item(
        self, thread_id: str, item_id: str, context: dict
    ) -> ThreadItem:
        for item in self.items.get(thread_id, []):
            if item.id == item_id:
                return item
        raise NotFoundError(f"Item {item_id} not found in thread {thread_id}")

    async def delete_thread(self, thread_id: str, context: dict) -> None:
        self.threads.pop(thread_id, None)
        self.items.pop(thread_id, None)

        attachment_ids = [
            attachment_id
            for attachment_id, attachment in self.attachments.items()
            if attachment.thread_id == thread_id
        ]

        for attachment_id in attachment_ids:
            self.attachments.pop(attachment_id, None)
            (UPLOAD_DIR / attachment_id).unlink(missing_ok=True)
        if self.cleanup_thread_files is not None:
            self.cleanup_thread_files(thread_id)
        self._persist()

    async def delete_all(self, context: dict) -> None:
        for thread_id in list(self.threads):
            if self.cleanup_thread_files is not None:
                self.cleanup_thread_files(thread_id)

        self.threads.clear()
        self.items.clear()
        self.attachments.clear()

        for path in UPLOAD_DIR.iterdir() if UPLOAD_DIR.exists() else []:
            if path.is_file():
                path.unlink()
        self._persist()

    async def delete_thread_item(
        self, thread_id: str, item_id: str, context: dict
    ) -> None:
        self.items[thread_id] = [
            item for item in self.items.get(thread_id, []) if item.id != item_id
        ]
        self._persist()

    def _load(self) -> None:
        if not self.path.is_file():
            return

        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            self.threads = {
                thread_id: ThreadMetadata.model_validate(thread)
                for thread_id, thread in data.get("threads", {}).items()
            }
            self.items = defaultdict(
                list,
                {
                    thread_id: [THREAD_ITEM_ADAPTER.validate_python(item) for item in items]
                    for thread_id, items in data.get("items", {}).items()
                },
            )
            self.attachments = {
                attachment_id: ATTACHMENT_ADAPTER.validate_python(attachment)
                for attachment_id, attachment in data.get("attachments", {}).items()
            }
        except (OSError, json.JSONDecodeError, ValueError) as error:
            raise RuntimeError(f"Unable to load ChatKit store at {self.path}") from error

    def _persist(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.parent.chmod(0o700)
        data = {
            "threads": {
                thread_id: thread.model_dump(mode="json")
                for thread_id, thread in self.threads.items()
            },
            "items": {
                thread_id: [item.model_dump(mode="json") for item in items]
                for thread_id, items in self.items.items()
            },
            "attachments": {
                attachment_id: attachment.model_dump(mode="json")
                for attachment_id, attachment in self.attachments.items()
            },
        }
        with NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=self.path.parent,
            prefix=f".{self.path.name}.",
            delete=False,
        ) as temporary_file:
            json.dump(data, temporary_file, ensure_ascii=True, separators=(",", ":"))
            temporary_path = Path(temporary_file.name)
        temporary_path.chmod(0o600)
        temporary_path.replace(self.path)
        self.path.chmod(0o600)

    def _paginate(
        self,
        rows: list,
        after: str | None,
        limit: int,
        order: str,
        sort_key,
        cursor_key,
    ):
        sorted_rows = sorted(rows, key=sort_key, reverse=order == "desc")
        start = 0
        if after:
            for idx, row in enumerate(sorted_rows):
                if cursor_key(row) == after:
                    start = idx + 1
                    break
        data = sorted_rows[start : start + limit]
        has_more = start + limit < len(sorted_rows)
        next_after = cursor_key(data[-1]) if has_more and data else None
        return Page(data=data, has_more=has_more, after=next_after)


class EphemeralStore(MemoryStore):
    """In-memory store whose threads never appear in the history listing."""

    def _load(self) -> None:
        return

    def _persist(self) -> None:
        return

    async def load_threads(
        self, limit: int, after: str | None, order: str, context: dict
    ) -> Page[ThreadMetadata]:
        return Page(data=[], has_more=False, after=None)
