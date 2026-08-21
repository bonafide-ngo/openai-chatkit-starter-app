from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

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
MAX_ATTACHMENT_BYTES = int(os.getenv("CHATKIT_MAX_ATTACHMENT_BYTES", str(25 * 1024 * 1024)))
IMAGE_PLACEHOLDER_URL = (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' "
    "height='72' viewBox='0 0 96 72'%3E%3Crect width='96' height='72' "
    "rx='8' fill='%23e5e7eb'/%3E%3Cpath d='m18 54 16-18 11 12 9-10 24 16' "
    "fill='none' stroke='%236b7280' stroke-width='4' stroke-linecap='round' "
    "stroke-linejoin='round'/%3E%3Ccircle cx='65' cy='24' r='6' "
    "fill='%236b7280'/%3E%3C/svg%3E"
)


def public_base_url(context: dict[str, Any]) -> str | None:
    configured_url = os.getenv("CHATKIT_PUBLIC_BASE_URL")
    if configured_url:
        parsed_url = urlparse(configured_url)
        if parsed_url.scheme != "https" or not parsed_url.netloc:
            raise RuntimeError(
                "CHATKIT_PUBLIC_BASE_URL must be a publicly reachable HTTPS URL"
            )
        return configured_url.rstrip("/")

    request = context.get("request")
    if request is not None:
        base_url = str(request.base_url).rstrip("/")
        parsed_url = urlparse(base_url)
        if parsed_url.scheme == "https" and parsed_url.hostname not in {
            "localhost",
            "127.0.0.1",
            "::1",
        }:
            return base_url

    return None


def upload_base_url(context: dict[str, Any]) -> str:
    return public_base_url(context) or str(context["request"].base_url).rstrip("/")


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

        upload_url = f"{upload_base_url(context)}/chatkit/uploads/{attachment_id}"

        descriptor = AttachmentUploadDescriptor(
            url=upload_url,
            method="PUT",
        )

        if input.mime_type.startswith("image/"):
            preview_url = public_base_url(context)
            attachment = ImageAttachment(
                id=attachment_id,
                name=input.name,
                mime_type=input.mime_type,
                preview_url=(
                    f"{preview_url}/chatkit/uploads/{attachment_id}"
                    if preview_url
                    else IMAGE_PLACEHOLDER_URL
                ),
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
