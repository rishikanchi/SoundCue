"""Bounded audio decoding, quality checks, and contextual measurements."""

from __future__ import annotations

from dataclasses import dataclass
import subprocess

import numpy as np


ALLOWED_MIME_BASE_TYPES = frozenset(
    {
        "audio/webm",
        "audio/ogg",
        "audio/mp4",
        "audio/mpeg",
        "audio/wav",
        "audio/x-wav",
    }
)


class AudioDecodeError(ValueError):
    """Audio could not be decoded safely."""


class QualityError(ValueError):
    def __init__(self, reasons: list[str], metrics: "TechnicalMetrics") -> None:
        super().__init__(";".join(reasons))
        self.reasons = reasons
        self.metrics = metrics


@dataclass(frozen=True)
class TechnicalMetrics:
    pitch_semitone_iqr: float | None
    loudness_variation_db: float | None
    voiced_coverage: float
    clipping_ratio: float
    discontinuity_ratio: float
    duration_seconds: float
    rms_dbfs: float

    def as_camel_case(self) -> dict[str, float | None]:
        return {
            "pitchSemitoneIqr": self.pitch_semitone_iqr,
            "loudnessVariationDb": self.loudness_variation_db,
            "voicedCoverage": self.voiced_coverage,
            "clippingRatio": self.clipping_ratio,
            "discontinuityRatio": self.discontinuity_ratio,
            "durationSeconds": self.duration_seconds,
            "rmsDbfs": self.rms_dbfs,
        }


def normalize_mime_type(value: str) -> str:
    return value.strip().lower().replace(" ", "")


def is_allowed_mime_type(value: str) -> bool:
    if not value or len(value) > 128 or any(character in value for character in "\r\n"):
        return False
    return normalize_mime_type(value).split(";", 1)[0] in ALLOWED_MIME_BASE_TYPES


def decode_to_mono_8khz(body: bytes, *, timeout_seconds: int = 15) -> np.ndarray:
    """Decode untrusted browser audio through a bounded FFmpeg subprocess."""

    try:
        import imageio_ffmpeg

        executable = imageio_ffmpeg.get_ffmpeg_exe()
        completed = subprocess.run(
            [
                executable,
                "-nostdin",
                "-v",
                "error",
                "-i",
                "pipe:0",
                "-map_metadata",
                "-1",
                "-t",
                "8.0",
                "-ac",
                "1",
                "-ar",
                "8000",
                "-f",
                "f32le",
                "pipe:1",
            ],
            input=body,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=timeout_seconds,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise AudioDecodeError("decode_failed") from exc
    if completed.returncode != 0 or not completed.stdout:
        raise AudioDecodeError("unsupported_or_corrupt_audio")
    waveform = np.frombuffer(completed.stdout, dtype="<f4").astype(np.float32, copy=True)
    if waveform.size == 0 or not np.isfinite(waveform).all():
        raise AudioDecodeError("invalid_audio_samples")
    return np.clip(waveform, -1.0, 1.0)


def _frame_rms(waveform: np.ndarray, frame_length: int = 320, hop_length: int = 80) -> np.ndarray:
    if len(waveform) < frame_length:
        return np.asarray([np.sqrt(np.mean(np.square(waveform), dtype=np.float64))])
    starts = range(0, len(waveform) - frame_length + 1, hop_length)
    return np.asarray(
        [
            np.sqrt(
                np.mean(np.square(waveform[start : start + frame_length]), dtype=np.float64)
            )
            for start in starts
        ]
    )


def technical_metrics(waveform: np.ndarray, sample_rate: int = 8000) -> TechnicalMetrics:
    waveform = np.asarray(waveform, dtype=np.float32)
    duration = len(waveform) / sample_rate
    rms = float(np.sqrt(np.mean(np.square(waveform), dtype=np.float64)))
    rms_dbfs = float(20 * np.log10(max(rms, 1e-9)))
    clipping_ratio = float(np.mean(np.abs(waveform) >= 0.99))
    deltas = np.abs(np.diff(waveform))
    delta_median = float(np.median(deltas))
    delta_mad = float(np.median(np.abs(deltas - delta_median)))
    # A fixed delta threshold mislabels strong/high-pitched vowels as pops. This
    # adaptive threshold measures only changes far outside the recording's own
    # sample-to-sample movement, with an absolute floor for quiet recordings.
    discontinuity_threshold = max(0.75, delta_median + 12 * delta_mad)
    discontinuity_ratio = float(np.mean(deltas >= discontinuity_threshold))
    frame_rms = _frame_rms(waveform)
    frame_db = 20 * np.log10(np.maximum(frame_rms, 1e-9))
    voiced_energy = frame_db >= max(-45.0, rms_dbfs - 18.0)
    voiced_coverage = float(np.mean(voiced_energy))
    loudness = (
        float(np.quantile(frame_db[voiced_energy], 0.75) - np.quantile(frame_db[voiced_energy], 0.25))
        if np.count_nonzero(voiced_energy) >= 4
        else None
    )

    pitch_iqr: float | None = None
    try:
        import librosa

        f0, voiced_flag, _ = librosa.pyin(
            waveform,
            fmin=65.0,
            fmax=500.0,
            sr=sample_rate,
            frame_length=512,
            hop_length=80,
        )
        valid = np.asarray(voiced_flag, dtype=bool) & np.isfinite(f0)
        if np.count_nonzero(valid) >= 4:
            semitones = 12 * np.log2(f0[valid] / 440.0)
            pitch_iqr = float(np.quantile(semitones, 0.75) - np.quantile(semitones, 0.25))
            voiced_coverage = float(np.mean(valid))
    except (ValueError, FloatingPointError):
        pitch_iqr = None

    return TechnicalMetrics(
        pitch_semitone_iqr=pitch_iqr,
        loudness_variation_db=loudness,
        voiced_coverage=voiced_coverage,
        clipping_ratio=clipping_ratio,
        discontinuity_ratio=discontinuity_ratio,
        duration_seconds=float(duration),
        rms_dbfs=rms_dbfs,
    )


def validate_quality(metrics: TechnicalMetrics, quality: dict) -> list[str]:
    reasons: list[str] = []
    if metrics.duration_seconds < quality["minDurationSeconds"]:
        reasons.append("too_short")
    if metrics.duration_seconds > quality["maxDurationSeconds"]:
        reasons.append("too_long")
    if metrics.rms_dbfs < quality["minRmsDbfs"]:
        reasons.append("low_input")
    if metrics.voiced_coverage < quality["minVoicedCoverage"]:
        reasons.append("insufficient_voiced_sound")
    if metrics.clipping_ratio > quality["maxClippingRatio"]:
        reasons.append("clipping")
    if metrics.discontinuity_ratio > quality["maxDiscontinuityRatio"]:
        reasons.append("excessive_discontinuity")
    return reasons
