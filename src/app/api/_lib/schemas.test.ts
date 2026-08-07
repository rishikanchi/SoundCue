import { describe, expect, it } from "vitest";
import {
  MAX_AUDIO_BYTES,
  acousticFeaturesSchema,
  createScreeningSchema,
  supportedAudioMimeType,
} from "./schemas";

describe("screening request validation", () => {
  it("accepts supported browser audio with codec parameters", () => {
    expect(supportedAudioMimeType.parse("audio/webm;codecs=opus")).toBe(
      "audio/webm;codecs=opus",
    );
  });

  it("rejects oversized and unsupported recordings", () => {
    expect(
      createScreeningSchema.safeParse({
        durationSeconds: 8,
        mimeType: "video/webm",
        sizeBytes: MAX_AUDIO_BYTES + 1,
      }).success,
    ).toBe(false);
  });

  it("requires a complete, range-checked feature payload", () => {
    expect(
      acousticFeaturesSchema.safeParse({
        version: "audio-features-v1",
        durationSeconds: 8,
        sampleRate: 48_000,
        rms: 0.2,
        peakAmplitude: 0.7,
        voicedCoverage: 0.9,
        clippingRatio: 0,
        pitchMeanHz: 160,
        pitchVariation: 0.1,
        jitter: 0.02,
        shimmer: 0.04,
        breathSupport: 0.8,
      }).success,
    ).toBe(true);
  });
});
