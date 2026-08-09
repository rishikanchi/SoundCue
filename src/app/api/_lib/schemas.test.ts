import { describe, expect, it } from "vitest";
import {
  MAX_DURATION_SECONDS,
  MAX_AUDIO_BYTES,
  acousticFeaturesSchema,
  ageYearsSchema,
  createScreeningSchema,
  researchAnalysisResultSchema,
  supportedAudioMimeType,
} from "./schemas";

const validResearchResult = {
  modelKind: "research",
  modelVersion: "three-component-v1",
  score: 0.52,
  band: "some",
  findings: [
    { code: "voice_steadiness", level: "moderate" },
    { code: "pitch_variation", level: "lower" },
    { code: "breath_support", level: "higher" },
  ],
  quality: { passed: true, reasons: [] },
  preprocessingVersion: "research-audio-v1",
  bandPolicyVersion: "development-tertiles-v1",
  modelArtifactSha256: "a".repeat(64),
  components: [
    { code: "ast_layer_3", score: 0.6, band: "some" },
    { code: "ast_layer_6", score: 0.5, band: "some" },
    { code: "wavlm_layer_1", score: 0.4, band: "fewer" },
  ],
  observations: [
    { code: "model_agreement", level: "middle" },
    { code: "pitch_steadiness", level: "higher" },
    { code: "loudness_stability", level: "middle" },
    { code: "sound_continuity", level: "higher" },
  ],
  technicalMetrics: {
    pitchSemitoneIqr: 1.8,
    loudnessVariationDb: 2.4,
    voicedCoverage: 0.92,
    clippingRatio: 0,
    durationSeconds: 6.1,
  },
} as const;

describe("screening request validation", () => {
  it("accepts supported browser audio with codec parameters", () => {
    expect(supportedAudioMimeType.parse("audio/webm;codecs=opus")).toBe(
      "audio/webm;codecs=opus",
    );
  });

  it("rejects oversized and line-breaking MIME metadata", () => {
    expect(supportedAudioMimeType.safeParse(`audio/webm;${"a".repeat(128)}`).success)
      .toBe(false);
    expect(supportedAudioMimeType.safeParse("audio/webm\r\nx-injected: true").success)
      .toBe(false);
  });

  it("rejects oversized and unsupported recordings", () => {
    expect(
      createScreeningSchema.safeParse({
        ageYears: 64,
        durationSeconds: 6,
        mimeType: "video/webm",
        sizeBytes: MAX_AUDIO_BYTES + 1,
      }).success,
    ).toBe(false);
  });

  it("requires an eligible whole-number age and a five-to-seven-second recording", () => {
    expect(ageYearsSchema.safeParse(18).success).toBe(true);
    expect(ageYearsSchema.safeParse(85).success).toBe(true);
    expect(ageYearsSchema.safeParse(17).success).toBe(false);
    expect(ageYearsSchema.safeParse(85.5).success).toBe(false);

    expect(
      createScreeningSchema.safeParse({
        ageYears: 64,
        durationSeconds: 6,
        mimeType: "audio/webm",
        sizeBytes: 1024,
      }).success,
    ).toBe(true);
    expect(
      createScreeningSchema.safeParse({
        ageYears: 64,
        durationSeconds: MAX_DURATION_SECONDS + 0.01,
        mimeType: "audio/webm",
        sizeBytes: 1024,
      }).success,
    ).toBe(false);
  });

  it("requires a complete, range-checked feature payload", () => {
    const validFeatures = {
      version: "audio-features-v1",
      durationSeconds: 6,
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
    } as const;
    expect(acousticFeaturesSchema.safeParse(validFeatures).success).toBe(true);
    expect(
      acousticFeaturesSchema.safeParse({
        ...validFeatures,
        durationSeconds: 4.99,
      }).success,
    ).toBe(false);
  });

  it("accepts a complete versioned research inference result", () => {
    expect(researchAnalysisResultSchema.safeParse(validResearchResult).success).toBe(
      true,
    );
  });

  it("rejects duplicate components and malformed artifact hashes", () => {
    const duplicate = {
      ...validResearchResult,
      modelArtifactSha256: "not-a-hash",
      components: [
        validResearchResult.components[0],
        validResearchResult.components[0],
        validResearchResult.components[2],
      ],
    };
    expect(researchAnalysisResultSchema.safeParse(duplicate).success).toBe(false);
  });

  it("rejects missing observation codes and non-finite technical metrics", () => {
    const malformed = {
      ...validResearchResult,
      observations: validResearchResult.observations.slice(0, 3),
      technicalMetrics: {
        ...validResearchResult.technicalMetrics,
        voicedCoverage: Number.NaN,
      },
    };
    expect(researchAnalysisResultSchema.safeParse(malformed).success).toBe(false);
  });
});
