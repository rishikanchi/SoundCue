from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pytest

import soundcue_inference.model as model_module
from soundcue_inference.config import Settings
from soundcue_inference.model import (
    ArtifactError,
    EncoderExtractor,
    ResearchAnalyzer,
    band_for_score,
    file_sha256,
)


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "model_manifest.json"
ARTIFACT = ROOT / "artifacts/research_ensemble.joblib"


class FakeExtractor:
    def extract(self, waveform: np.ndarray) -> dict[str, np.ndarray]:
        return {
            "ast_layer_3": np.linspace(-0.1, 0.1, 768),
            "ast_layer_6": np.linspace(-0.1, 0.1, 3072),
            "wavlm_layer_1": np.linspace(-0.1, 0.1, 768),
        }


def test_manifest_and_artifact_are_locked_and_sex_free() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert file_sha256(ARTIFACT) == manifest["model"]["artifact"]["sha256"]
    assert manifest["model"]["inputs"] == {"audio": True, "ageYears": True, "sex": False}
    assert manifest["bandPolicy"]["thresholds"] == [
        0.35761316872427984,
        0.6679012345679013,
    ]
    assert manifest["preprocessing"]["parity"]["passed"] is True
    assert manifest["preprocessing"]["parity"]["canonicalWavlm"][
        "participantsValidated"
    ] == 81
    bundle = joblib.load(ARTIFACT)
    assert np.allclose(bundle["weights"], [0.4, 0.4, 0.2])
    names = [name for component in bundle["components"] for name in component["feature_names"]]
    assert "Sex_M" not in names
    assert all("sex" not in name.lower() for name in names)


def test_band_mapping_is_versioned_tertile_mapping() -> None:
    thresholds = [0.35761316872427984, 0.6679012345679013]
    assert band_for_score(0.2, thresholds) == "fewer"
    assert band_for_score(thresholds[0], thresholds) == "some"
    assert band_for_score(thresholds[1], thresholds) == "more"


def test_encoder_bundle_is_required_before_inference(tmp_path: Path) -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    with pytest.raises(ArtifactError, match="model_cache_unavailable"):
        EncoderExtractor(manifest, tmp_path / "missing-cache")


def test_deployment_approved_hash_is_enforced_before_deserialization() -> None:
    settings = Settings(
        hmac_secret="test-secret-with-at-least-thirty-two-bytes",
        expected_artifact_sha256="0" * 64,
        manifest_path=MANIFEST,
        artifact_path=ARTIFACT,
    )
    with pytest.raises(ArtifactError, match="approved_artifact_hash_mismatch"):
        ResearchAnalyzer(settings, extractor=FakeExtractor())


def test_fake_encoder_inference_is_deterministic(monkeypatch) -> None:
    settings = Settings(
        hmac_secret="test-secret-with-at-least-thirty-two-bytes",
        expected_artifact_sha256=file_sha256(ARTIFACT),
        manifest_path=MANIFEST,
        artifact_path=ARTIFACT,
    )
    waveform = (0.2 * np.sin(2 * np.pi * 220 * np.arange(48_000) / 8000)).astype(np.float32)
    monkeypatch.setattr(model_module, "decode_to_mono_8khz", lambda _: waveform)
    analyzer = ResearchAnalyzer(settings, extractor=FakeExtractor())
    first = analyzer.analyze(b"audio", 64, "audio/webm")
    second = analyzer.analyze(b"audio", 64, "audio/webm")
    first.pop("inferenceDurationMs")
    second.pop("inferenceDurationMs")
    assert first == second
    assert first["modelKind"] == "research"
    assert first["quality"] == {"passed": True, "reasons": []}
    assert [item["code"] for item in first["components"]] == [
        "ast_layer_3",
        "ast_layer_6",
        "wavlm_layer_1",
    ]
