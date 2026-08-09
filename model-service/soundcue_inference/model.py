"""Pinned encoder extraction and three-component research inference."""

from __future__ import annotations

from functools import lru_cache
import hashlib
import json
import logging
import os
from pathlib import Path
import threading
import time
from typing import Any

import joblib
import numpy as np

from .audio import QualityError, TechnicalMetrics, decode_to_mono_8khz, technical_metrics, validate_quality
from .config import Settings
from .runtime_compat import install_librosa_stub_fallback


# Vercel's function bundle is read-only. Librosa imports Numba lazily, and
# Numba otherwise tries to place compiled cache files beside its installed
# modules. Keep every runtime cache in the writable function scratch space and
# bound native thread pools to the single vCPU available to Standard functions.
os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/soundcue-numba")
os.environ.setdefault("XDG_CACHE_HOME", "/tmp/soundcue-cache")
os.environ.setdefault("HF_HOME", "/tmp/soundcue-huggingface")
os.environ.setdefault("TORCH_HOME", "/tmp/soundcue-torch")
os.environ.setdefault("MPLCONFIGDIR", "/tmp/soundcue-matplotlib")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

logger = logging.getLogger("soundcue.inference")


@lru_cache(maxsize=1)
def configure_torch_runtime() -> None:
    import torch

    torch.set_num_threads(1)
    try:
        torch.set_num_interop_threads(1)
    except RuntimeError:
        # Another library may have initialized the inter-op pool first. The
        # OMP/MKL bounds above still keep inference on the allocated vCPU.
        pass


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
    # Log only the failing runtime stage and exception class/message. The
    # exception paths here contain dependency/runtime details, never recording
    # bytes, features, scores, request metadata, or user information.
    logger.error(
        "inference_stage_failed stage=%s error_type=%s detail=%s",
        stage,
        type(error).__name__,
        str(error)[:240],
    )
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
    """Lazily loads the two purpose-pruned pinned encoders."""

    def __init__(self, manifest: dict[str, Any], runtime_model_dir: Path | None) -> None:
        if runtime_model_dir is None or not runtime_model_dir.is_dir():
            raise ArtifactError("runtime_models_unavailable")
        self.manifest = manifest
        self.ast_dir = runtime_model_dir / "ast"
        self.wavlm_dir = runtime_model_dir / "wavlm"
        if not self.ast_dir.is_dir() or not self.wavlm_dir.is_dir():
            raise ArtifactError("runtime_models_incomplete")
        self._ast_processor = None
        self._ast_model = None
        self._wavlm_processor = None
        self._wavlm_model = None
        self._inference_lock = threading.Lock()

    def _load_ast(self) -> None:
        if self._ast_model is not None:
            return
        import torch
        from transformers import AutoFeatureExtractor, ASTModel

        configure_torch_runtime()

        if self._ast_processor is None:
            self._ast_processor = AutoFeatureExtractor.from_pretrained(
                self.ast_dir, local_files_only=True
            )
        self._ast_model = ASTModel.from_pretrained(
            self.ast_dir, local_files_only=True
        ).eval()
        torch.set_grad_enabled(False)

    def _load_wavlm(self) -> None:
        if self._wavlm_model is not None:
            return
        import torch
        from transformers import AutoFeatureExtractor, AutoModel

        configure_torch_runtime()

        if self._wavlm_processor is None:
            self._wavlm_processor = AutoFeatureExtractor.from_pretrained(
                self.wavlm_dir, local_files_only=True
            )
        self._wavlm_model = AutoModel.from_pretrained(
            self.wavlm_dir, local_files_only=True
        ).eval()
        torch.set_grad_enabled(False)

    def extract(self, waveform_8khz: np.ndarray) -> dict[str, np.ndarray]:
        with self._inference_lock:
            return self._extract_unlocked(waveform_8khz)

    def _extract_unlocked(self, waveform_8khz: np.ndarray) -> dict[str, np.ndarray]:
        install_librosa_stub_fallback()
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
                hidden_states = self._ast_model.embeddings(ast_inputs["input_values"])
                head_mask = self._ast_model.get_head_mask(
                    None, self._ast_model.config.num_hidden_layers
                )
                ast_l3_tensor = None
                for index, layer in enumerate(self._ast_model.encoder.layer):
                    layer_head_mask = head_mask[index] if head_mask is not None else None
                    hidden_states = layer(hidden_states, layer_head_mask)
                    if index == 2:
                        ast_l3_tensor = hidden_states[0, 1].float()
                if ast_l3_tensor is None or len(self._ast_model.encoder.layer) != 6:
                    raise ArtifactError("ast_runtime_depth_mismatch")
            ast_l3 = ast_l3_tensor.cpu().numpy().copy()
            hidden_l6 = hidden_states[0].float()
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
            if len(self._wavlm_model.encoder.layers) != 1:
                raise ArtifactError("wavlm_runtime_depth_mismatch")
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
        self.extractor = extractor or EncoderExtractor(
            self.manifest, settings.runtime_model_dir
        )

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
