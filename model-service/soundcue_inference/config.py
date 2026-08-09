"""Environment-backed service configuration."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Settings:
    hmac_secret: str
    expected_artifact_sha256: str
    manifest_path: Path = SERVICE_ROOT / "model_manifest.json"
    artifact_path: Path = SERVICE_ROOT / "artifacts" / "research_ensemble.joblib"
    model_cache_dir: Path | None = None
    max_audio_bytes: int = 4 * 1024 * 1024
    signature_ttl_seconds: int = 300

    @classmethod
    def from_environment(cls) -> "Settings":
        secret = os.environ.get("SOUNDCUE_INFERENCE_HMAC_SECRET", "")
        if len(secret.encode("utf-8")) < 32:
            raise RuntimeError("SOUNDCUE_INFERENCE_HMAC_SECRET must contain at least 32 bytes")
        expected_hash = os.environ.get("SOUNDCUE_EXPECTED_MODEL_SHA256", "").lower()
        if len(expected_hash) != 64 or any(character not in "0123456789abcdef" for character in expected_hash):
            raise RuntimeError("SOUNDCUE_EXPECTED_MODEL_SHA256 must be a lowercase SHA-256")
        bundled_cache = SERVICE_ROOT / ".model-cache"
        cache = os.environ.get("SOUNDCUE_MODEL_CACHE_DIR")
        return cls(
            hmac_secret=secret,
            expected_artifact_sha256=expected_hash,
            manifest_path=Path(
                os.environ.get(
                    "SOUNDCUE_MODEL_MANIFEST_PATH", SERVICE_ROOT / "model_manifest.json"
                )
            ),
            artifact_path=Path(
                os.environ.get(
                    "SOUNDCUE_MODEL_ARTIFACT_PATH",
                    SERVICE_ROOT / "artifacts" / "research_ensemble.joblib",
                )
            ),
            model_cache_dir=Path(cache) if cache else bundled_cache if bundled_cache.exists() else None,
            max_audio_bytes=int(
                os.environ.get("SOUNDCUE_MAX_AUDIO_BYTES", str(4 * 1024 * 1024))
            ),
            signature_ttl_seconds=int(
                os.environ.get("SOUNDCUE_SIGNATURE_TTL_SECONDS", "300")
            ),
        )
