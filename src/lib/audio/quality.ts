import type { AudioFeatures, AudioQualityIssue, AudioQualityReport } from "./types";

export const MIN_RECORDING_SECONDS = 5;
export const TARGET_RECORDING_SECONDS = 6;
export const MAX_RECORDING_SECONDS = 7;

export function evaluateAudioQuality(features: AudioFeatures): AudioQualityReport {
  const issues: AudioQualityIssue[] = [];

  if (features.durationSeconds < MIN_RECORDING_SECONDS) {
    issues.push({
      code: "too_short",
      message: "The recording is too short to review.",
      guidance: `Hold the “ahhh” sound for at least ${MIN_RECORDING_SECONDS} seconds.`,
    });
  }

  if (features.rms < 0.006 || features.voicedCoverage < 0.08) {
    issues.push({
      code: "silence",
      message: "We could not hear a sustained voice clearly.",
      guidance: "Check your microphone, then try again in a quiet room.",
    });
  } else if (features.rms < 0.015 || features.pitchMeanHz === null) {
    issues.push({
      code: "low_input",
      message: "Your voice was a little too quiet or interrupted.",
      guidance: "Move a little closer to the microphone and use a steady, comfortable volume.",
    });
  }

  if (features.voicedCoverage >= 0.08 && features.voicedCoverage < 0.55) {
    issues.push({
      code: "discontinuity",
      message: "The sustained sound was interrupted too often.",
      guidance: "Take a comfortable breath, then hold one continuous “ahhh” until recording stops.",
    });
  }

  if (features.clippingRatio > 0.02 || features.peakAmplitude >= 0.999) {
    issues.push({
      code: "clipping",
      message: "The recording was too loud for the microphone.",
      guidance: "Move slightly farther away and try again at a comfortable volume.",
    });
  }

  return {
    version: "audio-quality-v1",
    acceptable: issues.length === 0,
    issues,
  };
}
