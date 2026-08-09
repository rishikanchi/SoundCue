from __future__ import annotations

from io import BytesIO
import math
import wave

import numpy as np

from soundcue_inference.audio import (
    decode_to_mono_8khz,
    is_allowed_mime_type,
    technical_metrics,
    validate_quality,
)


QUALITY = {
    "minDurationSeconds": 5.0,
    "maxDurationSeconds": 7.5,
    "minRmsDbfs": -40.0,
    "minVoicedCoverage": 0.65,
    "maxClippingRatio": 0.01,
    "maxDiscontinuityRatio": 0.005,
}


def sine(seconds: float = 6.0, amplitude: float = 0.2) -> np.ndarray:
    time = np.arange(round(seconds * 8000)) / 8000
    return (amplitude * np.sin(2 * math.pi * 220 * time)).astype(np.float32)


def wav_bytes(waveform: np.ndarray) -> bytes:
    output = BytesIO()
    with wave.open(output, "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(8000)
        stream.writeframes((np.clip(waveform, -1, 1) * 32767).astype("<i2").tobytes())
    return output.getvalue()


def test_browser_mime_variants_are_checked_by_base_type() -> None:
    assert is_allowed_mime_type("audio/webm; codecs=opus")
    assert is_allowed_mime_type("audio/mp4;codecs=mp4a.40.2")
    assert not is_allowed_mime_type("video/webm")
    assert not is_allowed_mime_type("audio/webm\nX-Injected: yes")


def test_ffmpeg_decodes_to_bounded_mono_8khz() -> None:
    decoded = decode_to_mono_8khz(wav_bytes(sine()))
    assert 47_900 <= len(decoded) <= 48_100
    assert np.isfinite(decoded).all()


def test_quality_accepts_sustained_signal_and_rejects_silence_short_and_clipping() -> None:
    good = technical_metrics(sine())
    assert validate_quality(good, QUALITY) == []

    silence = technical_metrics(np.zeros(48_000, dtype=np.float32))
    silence_reasons = validate_quality(silence, QUALITY)
    assert "low_input" in silence_reasons
    assert "insufficient_voiced_sound" in silence_reasons

    short = technical_metrics(sine(seconds=4.9))
    assert "too_short" in validate_quality(short, QUALITY)

    clipped = technical_metrics(np.ones(48_000, dtype=np.float32))
    assert "clipping" in validate_quality(clipped, QUALITY)

    discontinuous = sine()
    discontinuous[::100] = 0.9
    discontinuous[1::100] = -0.9
    assert "excessive_discontinuity" in validate_quality(
        technical_metrics(discontinuous), QUALITY
    )
