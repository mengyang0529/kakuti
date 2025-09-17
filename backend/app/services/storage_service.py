from __future__ import annotations

import datetime as dt
import os
import tempfile
import re
from dataclasses import dataclass
from typing import Optional

from google.cloud import storage
from loguru import logger

from ..config import settings

_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


@dataclass
class SignedUpload:
    object_name: str
    upload_url: str
    required_headers: dict[str, str]


class StorageService:
    def __init__(self) -> None:
        if not settings.GCS_BUCKET:
            raise RuntimeError("GCS_BUCKET is not configured")
        self.bucket_name = settings.GCS_BUCKET
        self.prefix = settings.GCS_UPLOAD_PREFIX.rstrip("/") + "/" if settings.GCS_UPLOAD_PREFIX else ""
        self.client = storage.Client()

    def _sanitize_filename(self, filename: str) -> str:
        cleaned = _SAFE_NAME_RE.sub("-", filename.strip()) or "file"
        return cleaned[:128]

    def build_object_name(self, document_id: str, filename: str) -> str:
        safe_filename = self._sanitize_filename(filename)
        return f"{self.prefix}{document_id}/{safe_filename}"

    def create_signed_upload(self, object_name: str, content_type: str) -> SignedUpload:
        if settings.GCS_SIGNED_URL_EXPIRATION_SECONDS <= 0:
            raise RuntimeError("Signed URL expiration must be positive")
        bucket = self.client.bucket(self.bucket_name)
        blob = bucket.blob(object_name)
        expiration = dt.timedelta(seconds=settings.GCS_SIGNED_URL_EXPIRATION_SECONDS)
        upload_url = blob.generate_signed_url(
            version="v4",
            expiration=expiration,
            method="PUT",
            content_type=content_type,
        )
        logger.info("Generated signed upload URL for %s (expires in %ss)", object_name, settings.GCS_SIGNED_URL_EXPIRATION_SECONDS)
        return SignedUpload(
            object_name=object_name,
            upload_url=upload_url,
            required_headers={"Content-Type": content_type},
        )

    def download_to_tempfile(self, object_name: str) -> str:
        """Download object to a temporary file and return the path."""
        bucket = self.client.bucket(self.bucket_name)
        blob = bucket.blob(object_name)
        tmp_fd, tmp_path = tempfile.mkstemp(prefix="kakuti-", suffix=object_name.split('/')[-1])
        os.close(tmp_fd)
        blob.download_to_filename(tmp_path)
        logger.info("Downloaded %s to temp path %s", object_name, tmp_path)
        return tmp_path

    def delete_object(self, object_name: str) -> None:
        bucket = self.client.bucket(self.bucket_name)
        blob = bucket.blob(object_name)
        blob.delete(if_exists=True)
        logger.info("Deleted GCS object %s", object_name)


storage_service: Optional[StorageService] = None


def get_storage_service() -> StorageService:
    global storage_service
    if storage_service is None:
        storage_service = StorageService()
    return storage_service
