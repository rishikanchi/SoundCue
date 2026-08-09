"""Request authentication for the private web-to-model-service boundary."""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
import hashlib
import hmac
import threading
import time


SIGNATURE_VERSION = "v1"


class AuthenticationError(ValueError):
    """A request signature failed validation."""


class ReplayError(AuthenticationError):
    """A request identifier was reused inside the signature validity window."""


def body_sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def canonical_message(
    *, timestamp: str, request_id: str, age: str, mime_type: str, digest: str
) -> bytes:
    canonical_mime = mime_type.strip().lower().replace(" ", "")
    return "\n".join(
        [SIGNATURE_VERSION, timestamp, request_id, age, canonical_mime, digest.lower()]
    ).encode("utf-8")


def sign_request(
    secret: str,
    *,
    timestamp: str,
    request_id: str,
    age: str,
    mime_type: str,
    digest: str,
) -> str:
    return hmac.new(
        secret.encode("utf-8"),
        canonical_message(
            timestamp=timestamp,
            request_id=request_id,
            age=age,
            mime_type=mime_type,
            digest=digest,
        ),
        hashlib.sha256,
    ).hexdigest()


@dataclass
class ReplayCache:
    """Bounded process-local replay protection.

    The web application also owns durable idempotency. This cache closes immediate
    replay attempts that reach the same warm function instance without retaining
    any user or result data.
    """

    max_entries: int = 10_000

    def __post_init__(self) -> None:
        self._seen: OrderedDict[str, int] = OrderedDict()
        self._lock = threading.Lock()

    def claim(self, request_id: str, now: int, ttl_seconds: int) -> None:
        with self._lock:
            expired_before = now - ttl_seconds
            while self._seen:
                _, timestamp = next(iter(self._seen.items()))
                if timestamp >= expired_before:
                    break
                self._seen.popitem(last=False)
            if request_id in self._seen:
                raise ReplayError("request_id_reused")
            self._seen[request_id] = now
            self._seen.move_to_end(request_id)
            while len(self._seen) > self.max_entries:
                self._seen.popitem(last=False)


def verify_request(
    secret: str,
    *,
    timestamp: str,
    request_id: str,
    age: str,
    mime_type: str,
    supplied_digest: str,
    supplied_signature: str,
    body: bytes,
    ttl_seconds: int,
    replay_cache: ReplayCache,
    now: int | None = None,
) -> None:
    if not request_id or len(request_id) > 128:
        raise AuthenticationError("invalid_request_id")
    try:
        request_time = int(timestamp)
    except (TypeError, ValueError) as exc:
        raise AuthenticationError("invalid_timestamp") from exc
    current_time = int(time.time()) if now is None else now
    if abs(current_time - request_time) > ttl_seconds:
        raise AuthenticationError("stale_timestamp")
    actual_digest = body_sha256(body)
    if not hmac.compare_digest(actual_digest, supplied_digest.lower()):
        raise AuthenticationError("body_hash_mismatch")
    expected = sign_request(
        secret,
        timestamp=timestamp,
        request_id=request_id,
        age=age,
        mime_type=mime_type,
        digest=actual_digest,
    )
    if not hmac.compare_digest(expected, supplied_signature.lower()):
        raise AuthenticationError("invalid_signature")
    replay_cache.claim(request_id, current_time, ttl_seconds)
