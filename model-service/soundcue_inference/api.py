"""Private FastAPI surface for SoundCue research analysis."""

from __future__ import annotations

from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse

from .audio import AudioDecodeError, QualityError, is_allowed_mime_type, normalize_mime_type
from .auth import AuthenticationError, ReplayCache, ReplayError, verify_request
from .config import Settings
from .model import ArtifactError, InferenceStageError, get_analyzer


app = FastAPI(
    title="SoundCue research inference",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
replay_cache = ReplayCache()


def error_response(status: int, code: str, request_id: str | None = None) -> JSONResponse:
    payload: dict = {"error": {"code": code, "message": "The recording could not be analyzed."}}
    if request_id:
        payload["error"]["requestId"] = request_id
    return JSONResponse(payload, status_code=status, headers={"Cache-Control": "no-store"})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/analyze")
async def analyze(
    request: Request,
    x_soundcue_timestamp: str = Header(default=""),
    x_soundcue_request_id: str = Header(default=""),
    x_soundcue_age: str = Header(default=""),
    x_content_sha256: str = Header(default=""),
    x_soundcue_signature: str = Header(default=""),
) -> JSONResponse:
    try:
        settings = Settings.from_environment()
    except RuntimeError:
        return error_response(503, "service_not_configured", x_soundcue_request_id)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > settings.max_audio_bytes:
                return error_response(413, "audio_too_large", x_soundcue_request_id)
        except ValueError:
            return error_response(400, "invalid_content_length", x_soundcue_request_id)
    chunks: list[bytes] = []
    received = 0
    async for chunk in request.stream():
        received += len(chunk)
        if received > settings.max_audio_bytes:
            return error_response(413, "audio_too_large", x_soundcue_request_id)
        chunks.append(chunk)
    body = b"".join(chunks)
    if not body:
        return error_response(400, "empty_audio", x_soundcue_request_id)
    if len(body) > settings.max_audio_bytes:
        return error_response(413, "audio_too_large", x_soundcue_request_id)
    mime_type = normalize_mime_type(request.headers.get("content-type", ""))
    if not is_allowed_mime_type(mime_type):
        return error_response(415, "unsupported_audio_type", x_soundcue_request_id)
    try:
        verify_request(
            settings.hmac_secret,
            timestamp=x_soundcue_timestamp,
            request_id=x_soundcue_request_id,
            age=x_soundcue_age,
            mime_type=mime_type,
            supplied_digest=x_content_sha256,
            supplied_signature=x_soundcue_signature,
            body=body,
            ttl_seconds=settings.signature_ttl_seconds,
            replay_cache=replay_cache,
        )
    except ReplayError:
        return error_response(409, "request_replayed", x_soundcue_request_id)
    except AuthenticationError:
        return error_response(401, "request_authentication_failed", x_soundcue_request_id)
    try:
        age = int(x_soundcue_age)
    except ValueError:
        return error_response(422, "invalid_age", x_soundcue_request_id)
    if not 18 <= age <= 85 or str(age) != x_soundcue_age:
        return error_response(422, "age_out_of_range", x_soundcue_request_id)
    try:
        result = get_analyzer().analyze(body, age, mime_type)
    except QualityError as exc:
        return JSONResponse(
            {
                "error": {
                    "code": "recording_quality_failed",
                    "message": "Please make another recording.",
                    "requestId": x_soundcue_request_id,
                    "reasons": exc.reasons,
                }
            },
            status_code=422,
            headers={"Cache-Control": "no-store"},
        )
    except AudioDecodeError:
        return error_response(422, "audio_decode_failed", x_soundcue_request_id)
    except ArtifactError:
        return error_response(503, "model_unavailable", x_soundcue_request_id)
    except InferenceStageError as exc:
        return error_response(503, exc.code, x_soundcue_request_id)
    except Exception:
        return error_response(503, "analysis_failed", x_soundcue_request_id)
    return JSONResponse(result, headers={"Cache-Control": "no-store"})
