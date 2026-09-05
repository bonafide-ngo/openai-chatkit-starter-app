from __future__ import annotations

import os
from typing import Any

from fastapi import HTTPException, UploadFile
from openai import AsyncOpenAI, NotFoundError


def configured_vector_store_ids() -> list[str]:
    return [
        value.strip()
        for value in os.getenv("OPENAI_VECTOR_STORE_IDS", "").split(",")
        if value.strip()
    ]


def require_vector_store(vector_store_id: str) -> str:
    if vector_store_id not in configured_vector_store_ids():
        raise HTTPException(status_code=404, detail="Vector store is not configured")
    return vector_store_id


async def store_label(client: AsyncOpenAI, vector_store_id: str) -> str:
    try:
        vector_store = await client.vector_stores.retrieve(vector_store_id)
    except NotFoundError:
        return vector_store_id
    return vector_store.name or vector_store_id


async def list_vector_store_files(
    client: AsyncOpenAI,
    vector_store_id: str,
) -> list[dict[str, Any]]:
    response = await client.vector_stores.files.list(
        vector_store_id=vector_store_id,
        limit=100,
        order="desc",
    )
    files: list[dict[str, Any]] = []
    for vector_file in response.data:
        try:
            file = await client.files.retrieve(vector_file.id)
        except NotFoundError:
            # A deleted account file can remain in the vector-store listing briefly.
            continue
        files.append(
            {
                "id": vector_file.id,
                "filename": file.filename,
                "status": vector_file.status,
                "created_at": vector_file.created_at,
                "bytes": getattr(file, "bytes", None),
            }
        )
    return files


async def upload_and_replace(
    client: AsyncOpenAI,
    vector_store_id: str,
    upload: UploadFile,
) -> dict[str, Any]:
    filename = upload.filename or "uploaded-file"
    existing_files = await list_vector_store_files(client, vector_store_id)
    existing = [file for file in existing_files if file["filename"] == filename]

    content = await upload.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")

    new_file = await client.vector_stores.files.upload_and_poll(
        vector_store_id=vector_store_id,
        file=(filename, content, upload.content_type or "application/octet-stream"),
    )

    # Upload and index the replacement first. If indexing fails, the old file is
    # still available; once it succeeds, remove both old references and file data.
    for old_file in existing:
        await client.vector_stores.files.delete(
            file_id=old_file["id"],
            vector_store_id=vector_store_id,
        )
        await delete_account_file(client, old_file["id"])

    return {
        "id": new_file.id,
        "filename": filename,
        "status": new_file.status,
        "replaced": len(existing) > 0,
    }


async def delete_vector_store_file(
    client: AsyncOpenAI,
    vector_store_id: str,
    file_id: str,
) -> None:
    try:
        await client.vector_stores.files.delete(
            file_id=file_id,
            vector_store_id=vector_store_id,
        )
    except NotFoundError:
        pass

    await delete_account_file(client, file_id)


async def delete_account_file(client: AsyncOpenAI, file_id: str) -> None:
    """Remove the uploaded File object from the account after detaching it."""
    try:
        await client.files.delete(file_id)
    except NotFoundError:
        # The account-level file was already deleted; the desired state holds.
        pass
