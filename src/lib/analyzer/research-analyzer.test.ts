import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisInput } from "@/types/screening";
import { ResearchInferenceError, ResearchModelAnalyzer } from "./research-analyzer";

const artifactHash = "a".repeat(64);
const config = {
  url: "https://inference.example.test",
  secret: "shared-test-secret",
  expectedArtifactSha256: artifactHash,
};

const input: AnalysisInput = {
  ageYears: 64,
  durationSeconds: 6,
  features: {
    version: "audio-features-v1",
    durationSeconds: 6,
    sampleRate: 48_000,
    rms: 0.1,
    peakAmplitude: 0.4,
    voicedCoverage: 0.9,
    clippingRatio: 0,
    pitchMeanHz: 150,
    pitchVariation: 0.05,
    jitter: 0.01,
    shimmer: 0.02,
    breathSupport: 0.85,
  },
  recording: {
    bytes: Uint8Array.from([1, 2, 3, 4]).buffer,
    mimeType: "audio/webm",
  },
};

function validResponse(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    modelKind: "research",
    modelVersion: "research-3c-age-v1",
    preprocessingVersion: "encoder-audio-v1",
    bandPolicyVersion: "development-tertiles-v1",
    modelArtifactSha256: artifactHash,
    score: 0.52,
    band: "some",
    findings: [
      { code: "voice_steadiness", level: "moderate" },
      { code: "pitch_variation", level: "lower" },
      { code: "breath_support", level: "higher" },
    ],
    quality: { passed: true, reasons: [] },
    components: [
      { code: "ast_layer_3", score: 0.5, band: "some" },
      { code: "ast_layer_6", score: 0.6, band: "some" },
      { code: "wavlm_layer_1", score: 0.4, band: "some" },
    ],
    observations: [
      { code: "model_agreement", level: "higher" },
      { code: "pitch_steadiness", level: "middle" },
      { code: "loudness_stability", level: "middle" },
      { code: "sound_continuity", level: "higher" },
    ],
    technicalMetrics: {
      pitchSemitoneIqr: 0.5,
      loudnessVariationDb: 1.2,
      voicedCoverage: 0.9,
      clippingRatio: 0,
      discontinuityRatio: 0.03,
      durationSeconds: 6,
      rmsDbfs: -20,
    },
    inferenceDurationMs: 321,
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("ResearchModelAnalyzer", () => {
  it("signs the exact body and validates the versioned response", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const bytes = new Uint8Array(input.recording.bytes);
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(headers.get("x-content-sha256")).toBe(digest);
      const canonical = [
        "v1",
        headers.get("x-soundcue-timestamp"),
        headers.get("x-soundcue-request-id"),
        "64",
        "audio/webm",
        digest,
      ].join("\n");
      expect(headers.get("x-soundcue-signature")).toBe(
        createHmac("sha256", config.secret).update(canonical).digest("hex"),
      );
      return Response.json(validResponse());
    }));

    const result = await new ResearchModelAnalyzer(config).analyze(input);
    expect(result.modelKind).toBe("research");
    expect(result.band).toBe("some");
  });

  it("turns service quality rejection into a stable rerecord error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      error: {
        code: "recording_quality_failed",
        message: "Please make another recording.",
        requestId: "77b7f8c0-3241-4147-8ed0-a0f89dba53ab",
        reasons: ["silence"],
      },
    }, { status: 422 })));

    await expect(new ResearchModelAnalyzer(config).analyze(input)).rejects.toEqual(
      expect.objectContaining<Partial<ResearchInferenceError>>({
        code: "recording_quality_failed",
        reasons: ["silence"],
      }),
    );
  });

  it("normalizes browser codec parameters before signing", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("content-type")).toBe("audio/webm;codecs=opus");
      const bytes = new Uint8Array(input.recording.bytes);
      const digest = createHash("sha256").update(bytes).digest("hex");
      const canonical = [
        "v1",
        headers.get("x-soundcue-timestamp"),
        headers.get("x-soundcue-request-id"),
        "64",
        "audio/webm;codecs=opus",
        digest,
      ].join("\n");
      expect(headers.get("x-soundcue-signature")).toBe(
        createHmac("sha256", config.secret).update(canonical).digest("hex"),
      );
      return Response.json(validResponse());
    }));

    await new ResearchModelAnalyzer(config).analyze({
      ...input,
      recording: { ...input.recording, mimeType: " Audio/WebM; codecs=opus " },
    });
  });

  it("fails closed when the service reports a different artifact", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(validResponse({
      modelArtifactSha256: "b".repeat(64),
    }))));

    await expect(new ResearchModelAnalyzer(config).analyze(input)).rejects.toMatchObject({
      code: "model_artifact_mismatch",
    });
  });

  it("rejects a response that repeats a component code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(validResponse({
      components: [
        { code: "ast_layer_3", score: 0.5, band: "some" },
        { code: "ast_layer_3", score: 0.6, band: "some" },
        { code: "wavlm_layer_1", score: 0.4, band: "some" },
      ],
    }))));

    await expect(new ResearchModelAnalyzer(config).analyze(input)).rejects.toMatchObject({
      code: "invalid_inference_response",
    });
  });
});
