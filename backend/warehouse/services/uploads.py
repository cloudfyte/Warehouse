"""Storing user-uploaded images in object storage.

The frontend posts images as base64 data URLs. Keeping those in Postgres
inflates every row by ~33% and drags any query that selects the column, so
decode them once on the way in and keep only the storage path. The column
type does not change: it holds a short path instead of a giant blob.

Reads go back out through ``to_url``, which turns a stored path into a public
URL. Rows written before this change still hold a data URL and are passed
through untouched, so both forms work side by side and no backfill is
required for the app to keep functioning.
"""
import base64
import binascii
import logging
import uuid

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from graphql import GraphQLError

logger = logging.getLogger(__name__)

# Images only — this is a trust boundary, so the mime type is an allowlist
# rather than something derived from whatever the client sent.
_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB per image

_PASSTHROUGH_PREFIXES = ("http://", "https://", "/")


def is_data_url(value) -> bool:
    return isinstance(value, str) and value.startswith("data:")


def save_data_url(value: str, folder: str = "uploads") -> str:
    """Decode a base64 data URL into storage and return its path.

    Anything that is not a data URL is returned unchanged, so an already
    stored path or an empty string passes straight through and calling this
    twice on the same value is harmless.
    """
    if not value or not is_data_url(value):
        return value or ""

    header, _, encoded = value.partition(",")
    if not encoded:
        raise GraphQLError("Malformed image upload.")

    mime = header[len("data:"):].split(";")[0].strip().lower()
    extension = _EXTENSIONS.get(mime)
    if extension is None:
        raise GraphQLError(
            f"Unsupported image type '{mime or 'unknown'}'. Allowed: JPEG, PNG, WebP, GIF."
        )

    try:
        data = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise GraphQLError("Image upload is not valid base64.") from exc

    if not data:
        raise GraphQLError("Image upload is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise GraphQLError(
            f"Image is {len(data) // (1024 * 1024)}MB; the limit is {MAX_UPLOAD_BYTES // (1024 * 1024)}MB."
        )

    name = f"{folder.strip('/')}/{uuid.uuid4().hex}{extension}"
    return default_storage.save(name, ContentFile(data))


def save_data_urls_csv(value: str, folder: str = "uploads") -> str:
    """Same as ``save_data_url`` for a comma-separated list of images.

    Data URLs themselves contain commas, so the list is split on the boundary
    between one entry and the next ("," followed by "data:" or a path), never
    on a naive ``split(",")``.
    """
    if not value:
        return ""
    return ",".join(save_data_url(part, folder) for part in _split_entries(value))


def to_url(value: str) -> str:
    """Turn a stored path into a public URL.

    Data URLs (rows written before this change), absolute URLs and
    already-rooted paths are returned as-is.
    """
    if not value:
        return ""
    if is_data_url(value) or value.startswith(_PASSTHROUGH_PREFIXES):
        return value
    try:
        return default_storage.url(value)
    except Exception:
        logger.exception("Could not build a storage URL for %r", value)
        return ""


def to_urls_csv(value: str) -> str:
    if not value:
        return ""
    return ",".join(to_url(part) for part in _split_entries(value))


def _split_entries(value: str) -> list[str]:
    """Split a comma-separated list whose entries may themselves contain commas."""
    entries: list[str] = []
    for chunk in value.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        # A data URL's own commas produce chunks that do not start a new entry;
        # glue those back onto the entry being built.
        if entries and not (chunk.startswith("data:") or _looks_like_path(chunk)):
            entries[-1] = f"{entries[-1]},{chunk}"
        else:
            entries.append(chunk)
    return entries


def _looks_like_path(chunk: str) -> bool:
    return chunk.startswith(_PASSTHROUGH_PREFIXES) or "/" in chunk.split("?")[0]
