from __future__ import annotations

from pathlib import Path
from typing import Any

from chatkit.store import AttachmentStore
from chatkit.types import (
    Attachment,
    AttachmentCreateParams,
    AttachmentUploadDescriptor,
    FileAttachment,
    ImageAttachment,
)

UPLOAD_DIR = Path("/tmp/chatkit-uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class MemoryAttachmentStore(AttachmentStore[dict[str, Any]]):
    def __init__(self) -> None:
        self.attachments: dict[str, Attachment] = {}

    async def create_attachment(
        self,
        input: AttachmentCreateParams,
        context: dict[str, Any],
    ) -> Attachment:
        attachment_id = self.generate_attachment_id(
            input.mime_type,
            context,
        )

        upload_url = f"http://localhost:8000/chatkit/uploads/{attachment_id}"

        descriptor = AttachmentUploadDescriptor(
            url=upload_url,
            method="PUT",
        )

        if input.mime_type.startswith("image/"):
            attachment = ImageAttachment(
                id=attachment_id,
                name=input.name,
                mime_type=input.mime_type,
                preview_url=f"http://localhost:8000/chatkit/uploads/{attachment_id}",
                upload_descriptor=descriptor,
            )
        else:
            attachment = FileAttachment(
                id=attachment_id,
                name=input.name,
                mime_type=input.mime_type,
                upload_descriptor=descriptor,
            )

        self.attachments[attachment_id] = attachment

        return attachment

    async def delete_attachment(
        self,
        attachment_id: str,
        context: dict[str, Any],
    ) -> None:
        self.attachments.pop(attachment_id, None)

        path = UPLOAD_DIR / attachment_id

        if path.exists():
            path.unlink()
