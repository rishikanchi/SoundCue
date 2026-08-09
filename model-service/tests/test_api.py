from __future__ import annotations

import time

from fastapi.testclient import TestClient

import soundcue_inference.api as api_module
from soundcue_inference.auth import ReplayCache, body_sha256, sign_request


SECRET = "test-secret-with-at-least-thirty-two-bytes"
BODY = b"not-decoded-by-the-fake-analyzer"


class FakeAnalyzer:
    def analyze(self, body: bytes, age: int, mime_type: str) -> dict:
        return {"schemaVersion": 1, "modelKind": "research", "ageSeen": age}


def headers(*, request_id: str = "request-1", age: str = "64", body: bytes = BODY) -> dict:
    timestamp = str(int(time.time()))
    mime = "audio/webm;codecs=opus"
    digest = body_sha256(body)
    signature = sign_request(
        SECRET,
        timestamp=timestamp,
        request_id=request_id,
        age=age,
        mime_type=mime,
        digest=digest,
    )
    return {
        "Content-Type": mime,
        "X-SoundCue-Timestamp": timestamp,
        "X-SoundCue-Request-Id": request_id,
        "X-SoundCue-Age": age,
        "X-Content-SHA256": digest,
        "X-SoundCue-Signature": signature,
    }


def test_signed_request_succeeds_and_replay_fails(monkeypatch) -> None:
    monkeypatch.setenv("SOUNDCUE_INFERENCE_HMAC_SECRET", SECRET)
    monkeypatch.setenv("SOUNDCUE_EXPECTED_MODEL_SHA256", "a" * 64)
    monkeypatch.setattr(api_module, "get_analyzer", lambda: FakeAnalyzer())
    monkeypatch.setattr(api_module, "replay_cache", ReplayCache())
    client = TestClient(api_module.app)
    signed = headers()
    response = client.post("/v1/analyze", content=BODY, headers=signed)
    assert response.status_code == 200
    assert response.json()["ageSeen"] == 64
    assert response.headers["cache-control"] == "no-store"
    replay = client.post("/v1/analyze", content=BODY, headers=signed)
    assert replay.status_code == 409
    assert replay.json()["error"]["code"] == "request_replayed"


def test_tampering_age_and_unsupported_mime_fail_closed(monkeypatch) -> None:
    monkeypatch.setenv("SOUNDCUE_INFERENCE_HMAC_SECRET", SECRET)
    monkeypatch.setenv("SOUNDCUE_EXPECTED_MODEL_SHA256", "a" * 64)
    monkeypatch.setattr(api_module, "get_analyzer", lambda: FakeAnalyzer())
    monkeypatch.setattr(api_module, "replay_cache", ReplayCache())
    client = TestClient(api_module.app)
    signed = headers(request_id="tamper")
    signed["X-SoundCue-Age"] = "65"
    assert client.post("/v1/analyze", content=BODY, headers=signed).status_code == 401

    unsupported = headers(request_id="unsupported")
    unsupported["Content-Type"] = "video/webm"
    response = client.post("/v1/analyze", content=BODY, headers=unsupported)
    assert response.status_code == 415


def test_out_of_range_and_noncanonical_age_are_rejected(monkeypatch) -> None:
    monkeypatch.setenv("SOUNDCUE_INFERENCE_HMAC_SECRET", SECRET)
    monkeypatch.setenv("SOUNDCUE_EXPECTED_MODEL_SHA256", "a" * 64)
    monkeypatch.setattr(api_module, "get_analyzer", lambda: FakeAnalyzer())
    monkeypatch.setattr(api_module, "replay_cache", ReplayCache())
    client = TestClient(api_module.app)
    for index, age in enumerate(("17", "86", "064")):
        response = client.post(
            "/v1/analyze", content=BODY, headers=headers(request_id=f"age-{index}", age=age)
        )
        assert response.status_code == 422
