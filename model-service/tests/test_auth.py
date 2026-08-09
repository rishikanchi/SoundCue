from __future__ import annotations

import pytest

from soundcue_inference.auth import (
    AuthenticationError,
    ReplayCache,
    ReplayError,
    body_sha256,
    canonical_message,
    sign_request,
    verify_request,
)


SECRET = "test-secret-with-at-least-thirty-two-bytes"
BODY = b"audio"


def signed(timestamp: str = "1000", request_id: str = "request-1") -> dict[str, str]:
    digest = body_sha256(BODY)
    signature = sign_request(
        SECRET,
        timestamp=timestamp,
        request_id=request_id,
        age="64",
        mime_type="Audio/WebM; codecs=opus",
        digest=digest,
    )
    return {"digest": digest, "signature": signature}


def test_canonical_message_normalizes_mime() -> None:
    value = canonical_message(
        timestamp="1000",
        request_id="request-1",
        age="64",
        mime_type="Audio/WebM; codecs=opus",
        digest="ABC",
    )
    assert value == b"v1\n1000\nrequest-1\n64\naudio/webm;codecs=opus\nabc"


def test_valid_signature_is_claimed_once() -> None:
    values = signed()
    cache = ReplayCache()
    kwargs = dict(
        secret=SECRET,
        timestamp="1000",
        request_id="request-1",
        age="64",
        mime_type="audio/webm;codecs=opus",
        supplied_digest=values["digest"],
        supplied_signature=values["signature"],
        body=BODY,
        ttl_seconds=300,
        replay_cache=cache,
        now=1000,
    )
    verify_request(**kwargs)
    with pytest.raises(ReplayError):
        verify_request(**kwargs)


def test_tampered_body_and_stale_timestamp_are_rejected() -> None:
    values = signed()
    base = dict(
        secret=SECRET,
        timestamp="1000",
        request_id="request-1",
        age="64",
        mime_type="audio/webm;codecs=opus",
        supplied_digest=values["digest"],
        supplied_signature=values["signature"],
        ttl_seconds=300,
        replay_cache=ReplayCache(),
    )
    with pytest.raises(AuthenticationError):
        verify_request(**base, body=b"tampered", now=1000)
    with pytest.raises(AuthenticationError):
        verify_request(**base, body=BODY, now=1400)

