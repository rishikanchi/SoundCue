import type { AcousticFeatures, RecordingQuality } from "@/types/screening";

const MIN_DURATION_SECONDS = 5;
const MAX_CLIPPING_RATIO = 0.02;

export function assessRecordingQuality(
  features: AcousticFeatures,
): RecordingQuality {
  const reasons: string[] = [];

  if (features.durationSeconds < MIN_DURATION_SECONDS) reasons.push("too_short");
  if (features.rms < 0.006 || features.voicedCoverage < 0.08) {
    reasons.push("silence");
  } else if (
    features.rms < 0.015 ||
    features.voicedCoverage < 0.55 ||
    features.pitchMeanHz == null ||
    features.pitchMeanHz <= 0
  ) {
    reasons.push("low_input");
  }
  if (
    features.clippingRatio > MAX_CLIPPING_RATIO ||
    features.peakAmplitude >= 0.999
  ) {
    reasons.push("clipping");
  }

  return { passed: reasons.length === 0, reasons };
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function scoreToBand(score: number): "fewer" | "some" | "more" {
  if (score < 0.34) return "fewer";
  if (score < 0.67) return "some";
  return "more";
}
