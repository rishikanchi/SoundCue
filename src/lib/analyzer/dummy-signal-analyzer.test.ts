import { afterEach, describe, expect, it, vi } from "vitest";
import type { AcousticFeatures } from "@/types/screening";
import { DummySignalAnalyzer } from "./dummy-signal-analyzer";
import { assessRecordingQuality, scoreToBand } from "./features";
import { getAnalyzer } from "./index";

const steadyFeatures: AcousticFeatures = {
  version: "audio-features-v1",
  durationSeconds: 8,
  sampleRate: 48_000,
  rms: 0.24,
  peakAmplitude: 0.64,
  voicedCoverage: 0.93,
  clippingRatio: 0,
  pitchMeanHz: 172,
  pitchVariation: 0.04,
  jitter: 0.012,
  shimmer: 0.025,
  breathSupport: 0.88,
};

describe("recording quality", () => {
  it("accepts a sustained, audible, unclipped recording", () => {
    expect(assessRecordingQuality(steadyFeatures)).toEqual({
      passed: true,
      reasons: [],
    });
  });

  it("returns stable reason codes for each rerecord condition", () => {
    expect(
      assessRecordingQuality({
        ...steadyFeatures,
        durationSeconds: 3,
        rms: 0.001,
        voicedCoverage: 0.2,
        clippingRatio: 0.2,
        pitchMeanHz: null,
      }),
    ).toEqual({
      passed: false,
      reasons: [
        "too_short",
        "silence",
        "clipping",
      ],
    });
  });
});

describe("DummySignalAnalyzer", () => {
  it("returns the same output for the same input", async () => {
    const analyzer = new DummySignalAnalyzer();
    const input = {
      durationSeconds: 8,
      features: steadyFeatures,
      recording: { bytes: new ArrayBuffer(8), mimeType: "audio/webm" },
    };
    expect(await analyzer.analyze(input)).toEqual(await analyzer.analyze(input));
  });

  it("always returns the three reviewed finding codes", async () => {
    const result = await new DummySignalAnalyzer().analyze({
      durationSeconds: 8,
      features: steadyFeatures,
      recording: { bytes: new ArrayBuffer(8), mimeType: "audio/webm" },
    });
    expect(result.findings.map(({ code }) => code)).toEqual([
      "voice_steadiness",
      "pitch_variation",
      "breath_support",
    ]);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

describe("scoreToBand", () => {
  it.each([
    [0, "fewer"],
    [0.339, "fewer"],
    [0.34, "some"],
    [0.669, "some"],
    [0.67, "more"],
    [1, "more"],
  ] as const)("maps %s to %s", (score, expected) => {
    expect(scoreToBand(score)).toBe(expected);
  });
});

describe("analyzer release guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed with the placeholder analyzer in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ANALYZER_MODE", "dummy");
    expect(() => getAnalyzer()).toThrow("DUMMY_ANALYZER_DISABLED_IN_PRODUCTION");
  });

  it("allows the placeholder analyzer in preview", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("ANALYZER_MODE", "dummy");
    expect(getAnalyzer()).toBeInstanceOf(DummySignalAnalyzer);
  });
});
