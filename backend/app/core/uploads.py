from __future__ import annotations

from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import UploadFile
from pydantic import BaseModel

from app.core.config import settings


ALLOWED_UPLOAD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


class UploadValidationError(ValueError):
    pass


class SavedUpload(BaseModel):
    absolute_path: str
    relative_path: str
    public_url: str
    size_bytes: int


def _uploads_root() -> Path:
    root = Path(settings.uploads_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def ensure_upload_base_dirs() -> None:
    root = _uploads_root()
    (root / "stores").mkdir(parents=True, exist_ok=True)
    (root / "products").mkdir(parents=True, exist_ok=True)


def get_store_upload_dir(store_id: int) -> Path:
    path = _uploads_root() / "stores" / str(store_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_product_upload_dir(product_id: int) -> Path:
    path = _uploads_root() / "products" / str(product_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def build_upload_public_url(relative_path: str) -> str:
    base = settings.uploads_base_url.rstrip("/")
    rel = relative_path.replace("\\", "/").lstrip("/")
    return f"{base}/{rel}"


def resolve_upload_path_from_public_url(public_url: str | None) -> Path | None:
    if not public_url:
        return None

    raw_path = urlsplit(public_url).path if "://" in public_url else public_url
    base = settings.uploads_base_url.rstrip("/")
    normalized = raw_path.replace("\\", "/")
    if not normalized.startswith(f"{base}/"):
        return None

    relative_path = normalized[len(base) + 1 :]
    root = _uploads_root()
    candidate = (root / relative_path).resolve()
    if root not in candidate.parents and candidate != root:
        return None
    return candidate


def delete_upload_by_public_url(public_url: str | None) -> bool:
    path = resolve_upload_path_from_public_url(public_url)
    if not path or not path.is_file():
        return False
    path.unlink(missing_ok=True)
    return True


def _validated_extension(filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in ALLOWED_UPLOAD_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_UPLOAD_EXTENSIONS))
        raise UploadValidationError(f"Invalid file extension. Allowed: {allowed}")
    return suffix


async def save_upload_file(
    file: UploadFile,
    *,
    target_dir: Path,
    max_size_bytes: int | None = None,
) -> SavedUpload:
    max_size = max_size_bytes or settings.uploads_max_size_bytes
    extension = _validated_extension(file.filename)
    filename = f"{uuid4().hex}{extension}"

    target_dir.mkdir(parents=True, exist_ok=True)
    destination = target_dir / filename

    total_size = 0
    try:
        with destination.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > max_size:
                    raise UploadValidationError(f"File too large. Max size is {max_size} bytes")
                out.write(chunk)
    except Exception:
        if destination.exists():
            destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    root = _uploads_root()
    relative_path = destination.relative_to(root).as_posix()
    return SavedUpload(
        absolute_path=str(destination),
        relative_path=relative_path,
        public_url=build_upload_public_url(relative_path),
        size_bytes=total_size,
    )
