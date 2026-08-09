"""Pinned encoder extraction and three-component research inference."""

from __future__ import annotations

from functools import lru_cache
import gc
import hashlib
import json
from pathlib import Path
import time
from typing import Any

import joblib
import numpy as np

from .audio import QualityError, TechnicalMetrics, decode_to_mono_8khz, technical_metrics, validate_quality
from .config import Settings


class ArtifactError(RuntimeError):
    """The checked-in model artifact or manifest is inconsistent."""


class InferenceStageError(RuntimeError):
    """A coarse, non-sensitive inference stage failure."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def inference_stage_error(stage: str, error: Exception) -> InferenceStageError:
    if isinstance(error, (ImportError, ModuleNotFoundError)):
        reason = "dependency"
    elif isinstance(error, MemoryError):
        reason = "memory"
    elif isinstance(error, OSError):
        reason = "resource"
    elif isinstance(error, RuntimeError) and any(
        marker in str(error).lower() for marker in ("memory", "allocate", "bad_alloc")
    ):
        reason = "memory"
    else:
        reason = "runtime"
    return InferenceStageError(f"{stage}_{reason}_failed")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def empirical_cdf(value: float, reference: np.ndarray) -> float:
    reference = np.asarray(reference, dtype=float)
    return float(
        (np.sum(reference < value) + 0.5 * np.sum(reference == value) + 0.5)
        / (len(reference) + 1)
    )


def band_for_score(score: float, thresholds: list[float]) -> str:
    if score < thresholds[0]:
        return "fewer"
    if score < thresholds[1]:
        return "some"
    return "more"


def _reference_level(value: float | None, thresholds: list[float], *, invert: bool) -> str:
    if value is None:
        return "middle"
    index = 0 if value < thresholds[0] else 1 if value < thresholds[1] else 2
    if invert:
        index = 2 - index
    return ("lower", "middle", "higher")[index]


def _legacy_level(stability_level: str) -> str:
    return {"higher": "lower", "middle": "moderate", "lower": "higher"}[stability_level]


class EncoderExtractor:
    """Lazily loads the two pinned encoders once per warm process."""

    def __init__(self, manifest: dict[str, Any], cache_dir: Path | None) -> None:
        if cache_dir is None or not cache_dir.is_dir():
            raise ArtifactError("model_cache_unavailable")
        self.manifest = manifest
        self.cache_dir = str(cache_dir)
        self._ast_processor = None
        self._ast_model = None
        self._wavlm_processor = None
        self._wavlm_model = None

    def _load_ast(self) -> None:
        if self._ast_model is not None:
            return
        import torch
        from transformers import AutoFeatureExtractor, ASTModel

        revisions = self.manifest["model"]["encoderRevisions"]
        ast = revisions["ast"]
        # Production inference is fully self-contained. A deployment with a
        # missing encoder bundle fails closed instead of downloading weights on
        # a user request.
        common = {"cache_dir": self.cache_dir, "local_files_only": True}
        if self._ast_processor is None:
            self._ast_processor = AutoFeatureExtractor.from_pretrained(
                ast["modelId"], revision=ast["revision"], **common
            )
        self._ast_model = ASTModel.from_pretrained(
            ast["modelId"], revision=ast["revision"], **common
        ).eval()
        torch.set_grad_enabled(False)

    def _load_wavlm(self) -> None:
        if self._wavlm_model is not None:
            return
        import torch
        from transformers import AutoFeatureExtractor, AutoModel

        wavlm = self.manifest["model"]["encoderRevisions"]["wavlm"]
        common = {"cache_dir": self.cache_dir, "local_files_only": True}
        if self._wavlm_processor is None:
            self._wavlm_processor = AutoFeatureExtractor.from_pretrained(
                wavlm["modelId"], revision=wavlm["revision"], **common
            )
        self._wavlm_model = AutoModel.from_pretrained(
            wavlm["modelId"], revision=wavlm["revision"], **common
        ).eval()
        torch.set_grad_enabled(False)

    def _release_ast(self) -> None:
        self._ast_model = None
        gc.collect()

    def _release_wavlm(self) -> None:
        self._wavlm_model = None
        gc.collect()

    def extract(self, waveform_8khz: np.ndarray) -> dict[str, np.ndarray]:
        try:
            import librosa
            import torch
        except Exception as exc:
            raise inference_stage_error("encoder_import", exc) from exc

        try:
            waveform = librosa.resample(
                waveform_8khz, orig_sr=8000, target_sr=16000
            ).astype(np.float32)
        except Exception as exc:
            raise inference_stage_error("audio_resample", exc) from exc

        try:
            self._load_ast()
        except Exception as exc:
            raise inference_stage_error("ast_load", exc) from exc
        try:
            ast_inputs = self._ast_processor(
                [waveform], sampling_rate=16000, padding="max_length", return_tensors="pt"
            )
            with torch.inference_mode():
                ast_output = self._ast_model(
                    input_values=ast_inputs["input_values"], output_hidden_states=True
                )
            ast_l3 = ast_output.hidden_states[3][0, 1].float().cpu().numpy().copy()
            hidden_l6 = ast_output.hidden_states[6][0].float()
            ast_l6 = torch.cat(
                [
                    hidden_l6.mean(dim=0),
                    hidden_l6.std(dim=0, unbiased=False),
                    hidden_l6[0],
                    hidden_l6[1],
                ]
            ).cpu().numpy().copy()
        except Exception as exc:
            raise inference_stage_error("ast_inference", exc) from exc
        finally:
            self._release_ast()

        try:
            self._load_wavlm()
        except Exception as exc:
            raise inference_stage_error("wavlm_load", exc) from exc
        try:
            wavlm_inputs = self._wavlm_processor(
                [waveform],
                sampling_rate=16000,
                padding="max_length",
                max_length=120_000,
                truncation=True,
                return_attention_mask=True,
                return_tensors="pt",
            )
            attention_mask = wavlm_inputs["attention_mask"]
            with torch.inference_mode():
                wavlm_output = self._wavlm_model(
                    input_values=wavlm_inputs["input_values"],
                    attention_mask=attention_mask,
                    output_hidden_states=True,
                )
            frame_length = int(
                self._wavlm_model._get_feat_extract_output_lengths(attention_mask.sum(dim=1))[0]
            )
            wavlm_l1 = (
                wavlm_output.hidden_states[1][0, :frame_length]
                .float()
                .mean(dim=0)
                .cpu()
                .numpy()
                .copy()
            )
        except Exception as exc:
            raise inference_stage_error("wavlm_inference", exc) from exc
        finally:
            self._release_wavlm()
        try:
            return {
                "ast_layer_3": ast_l3.astype(np.float64),
                "ast_layer_6": ast_l6.astype(np.float64),
                "wavlm_layer_1": wavlm_l1.astype(np.float64),
            }
        except Exception as exc:
            raise inference_stage_error("encoder_output", exc) from exc


class ResearchAnalyzer:
    def __init__(self, settings: Settings, extractor: EncoderExtractor | None = None) -> None:
        self.settings = settings
        self.manifest = json.loads(settings.manifest_path.read_text(encoding="utf-8"))
        expected = self.manifest["model"]["artifact"]["sha256"]
        if settings.expected_artifact_sha256 and settings.expected_artifact_sha256 != expected:
            raise ArtifactError("approved_artifact_hash_mismatch")
        actual = file_sha256(settings.artifact_path)
        if actual != expected:
            raise ArtifactError("model_artifact_hash_mismatch")
        self.bundle = joblib.load(settings.artifact_path)
        if self.bundle.get("model_version") != self.manifest["model"]["version"]:
            raise ArtifactError("model_version_mismatch")
        if "Sex_M" in {
            name for component in self.bundle["components"] for name in component["feature_names"]
        }:
            raise ArtifactError("sex_input_present")
        self.extractor = extractor or EncoderExtractor(self.manifest, settings.model_cache_dir)

    def _component_scores(self, age: int, features: dict[str, np.ndarray]) -> list[dict]:
        thresholds = self.manifest["bandPolicy"]["thresholds"]
        outputs = []
        for component in self.bundle["components"]:
            values = np.r_[float(age), features[component["code"]]].reshape(1, -1)
            raw = getattr(component["estimator"], component["method"])(values)
            raw_value = float(raw[0, 1] if np.ndim(raw) == 2 else raw[0])
            score = empirical_cdf(raw_value, component["calibration_reference"])
            outputs.append(
                {"code": component["code"], "score": score, "band": band_for_score(score, thresholds)}
            )
        return outputs

    def _observations(self, components: list[dict], metrics: TechnicalMetrics) -> list[dict]:
        references = self.manifest["observationReferences"]
        bands = [item["band"] for item in components]
        score_spread = max(item["score"] for item in components) - min(
            item["score"] for item in components
        )
        if len(set(bands)) == 1 and score_spread <= 0.34:
            agreement = "higher"
        elif len(set(bands)) == 3 or score_spread > 0.60:
            agreement = "lower"
        else:
            agreement = "middle"
        return [
            {"code": "model_agreement", "level": agreement},
            {
                "code": "pitch_steadiness",
                "level": _reference_level(
                    metrics.pitch_semitone_iqr,
                    references["pitchSemitoneIqr"]["thresholds"],
                    invert=True,
                ),
            },
            {
                "code": "loudness_stability",
                "level": _reference_level(
                    metrics.loudness_variation_db,
                    references["loudnessVariationDb"]["thresholds"],
                    invert=True,
                ),
            },
            {
                "code": "sound_continuity",
                "level": _reference_level(
                    metrics.voiced_coverage,
                    references["voicedCoverage"]["thresholds"],
                    invert=False,
                ),
            },
        ]

    def analyze(self, body: bytes, age: int, mime_type: str) -> dict[str, Any]:
        started = time.perf_counter()
        waveform = decode_to_mono_8khz(body)
        try:
            metrics = technical_metrics(waveform)
        except Exception as exc:
            raise InferenceStageError("audio_measurement_failed") from exc
        reasons = validate_quality(metrics, self.manifest["quality"])
        if reasons:
            raise QualityError(reasons, metrics)
        try:
            features = self.extractor.extract(waveform)
        except InferenceStageError:
            raise
        except Exception as exc:
            raise inference_stage_error("encoder_inference", exc) from exc
        try:
            components = self._component_scores(age, features)
        except Exception as exc:
            raise InferenceStageError("component_scoring_failed") from exc
        weights = np.asarray(self.bundle["weights"], dtype=float)
        score = float(np.asarray([item["score"] for item in components]) @ weights)
        band = band_for_score(score, self.manifest["bandPolicy"]["thresholds"])
        observations = self._observations(components, metrics)
        observation = {item["code"]: item["level"] for item in observations}
        steadiness = min(
            [observation["pitch_steadiness"], observation["loudness_stability"]],
            key=("lower", "middle", "higher").index,
        )
        return {
            "schemaVersion": 1,
            "modelKind": "research",
            "modelVersion": self.manifest["model"]["version"],
            "preprocessingVersion": self.manifest["preprocessing"]["version"],
            "bandPolicyVersion": self.manifest["bandPolicy"]["version"],
            "modelArtifactSha256": self.manifest["model"]["artifact"]["sha256"],
            "score": score,
            "band": band,
            "findings": [
                {"code": "voice_steadiness", "level": _legacy_level(steadiness)},
                {
                    "code": "pitch_variation",
                    "level": _legacy_level(observation["pitch_steadiness"]),
                },
                {
                    "code": "breath_support",
                    "level": _legacy_level(observation["sound_continuity"]),
                },
            ],
            "quality": {"passed": True, "reasons": []},
            "components": components,
            "observations": observations,
            "technicalMetrics": metrics.as_camel_case(),
            "inferenceDurationMs": round((time.perf_counter() - started) * 1000),
        }


@lru_cache(maxsize=1)
def get_analyzer() -> ResearchAnalyzer:
    return ResearchAnalyzer(Settings.from_environment())
