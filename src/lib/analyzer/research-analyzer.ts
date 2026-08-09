import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type {
  Analyzer,
  AnalysisInput,
  ResearchAnalysisResult,
} from "@/types/screening";

const INFERENCE_TIMEOUT_MS = 120_000;

const componentSchema = z.object({
  code: z.enum(["ast_layer_3", "ast_layer_6", "wavlm_layer_1"]),
  score: z.number().finite().min(0).max(1),
  band: z.enum(["fewer", "some", "more"]),
}).strict();

const responseSchema = z.object({
  schemaVersion: z.literal(1),
  modelKind: z.literal("research"),
  modelVersion: z.string().min(1).max(100),
  preprocessingVersion: z.string().min(1).max(100),
  bandPolicyVersion: z.string().min(1).max(100),
  modelArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  score: z.number().finite().min(0).max(1),
  band: z.enum(["fewer", "some", "more"]),
  findings: z.array(z.object({
    code: z.enum(["voice_steadiness", "pitch_variation", "breath_support"]),
    level: z.enum(["lower", "moderate", "higher"]),
  }).strict()).length(3),
  quality: z.object({
    passed: z.boolean(),
    reasons: z.array(z.string().min(1).max(100)).max(10),
  }).strict(),
  components: z.array(componentSchema).length(3),
  observations: z.array(z.object({
    code: z.enum([
      "model_agreement",
      "pitch_steadiness",
      "loudness_stability",
      "sound_continuity",
    ]),
    level: z.enum(["lower", "middle", "higher"]),
  }).strict()).length(4),
  technicalMetrics: z.object({
    pitchSemitoneIqr: z.number().finite().nonnegative().nullable(),
    loudnessVariationDb: z.number().finite().nonnegative().nullable(),
    voicedCoverage: z.number().finite().min(0).max(1),
    clippingRatio: z.number().finite().min(0).max(1),
    discontinuityRatio: z.number().finite().min(0).max(1),
    durationSeconds: z.number().finite().positive().max(7.5),
    rmsDbfs: z.number().finite().max(0),
  }).strict(),
  inferenceDurationMs: z.number().finite().nonnegative(),
}).strict().superRefine((value, context) => {
  for (const [field, codes, expected] of [
    ["components", value.components.map(({ code }) => code), ["ast_layer_3", "ast_layer_6", "wavlm_layer_1"]],
    ["findings", value.findings.map(({ code }) => code), ["voice_steadiness", "pitch_variation", "breath_support"]],
    ["observations", value.observations.map(({ code }) => code), ["model_agreement", "pitch_steadiness", "loudness_stability", "sound_continuity"]],
  ] as const) {
    if (new Set(codes).size !== expected.length || expected.some((code) => !codes.includes(code as never))) {
      context.addIssue({
        code: "custom",
        path: [field],
        message: `${field} must contain each expected code exactly once`,
      });
    }
  }
});

const qualityErrorSchema = z.object({
  error: z.object({
    code: z.literal("recording_quality_failed"),
    message: z.string(),
    requestId: z.string(),
    reasons: z.array(z.string().min(1).max(100)).max(10),
  }).strict(),
}).strict();

export type ResearchAnalyzerResult = ResearchAnalysisResult & {
  inferenceDurationMs: number;
  technicalMetrics: ResearchAnalysisResult["technicalMetrics"] & {
    discontinuityRatio: number;
    rmsDbfs: number;
  };
};

export class ResearchInferenceError extends Error {
  constructor(
    readonly code:
      | "recording_quality_failed"
      | "inference_timeout"
      | "inference_unavailable"
      | "invalid_inference_response"
      | "model_artifact_mismatch",
    readonly reasons: string[] = [],
  ) {
    super(code);
    this.name = "ResearchInferenceError";
  }
}

type ResearchAnalyzerConfig = {
  url: string;
  secret: string;
  expectedArtifactSha256: string;
};

function requiredConfig(): ResearchAnalyzerConfig {
  const url = process.env.SOUNDCUE_INFERENCE_URL?.trim();
  const secret = process.env.SOUNDCUE_INFERENCE_HMAC_SECRET;
  const expectedArtifactSha256 = process.env.SOUNDCUE_MODEL_ARTIFACT_SHA256?.trim().toLowerCase();
  if (!url || !secret || !expectedArtifactSha256) {
    throw new Error("RESEARCH_ANALYZER_NOT_CONFIGURED");
  }
  const parsedUrl = new URL(url);
  if (process.env.NODE_ENV === "production" && parsedUrl.protocol !== "https:") {
    throw new Error("RESEARCH_ANALYZER_HTTPS_REQUIRED");
  }
  if (!/^[a-f0-9]{64}$/.test(expectedArtifactSha256)) {
    throw new Error("RESEARCH_ANALYZER_HASH_INVALID");
  }
  return { url: parsedUrl.toString(), secret, expectedArtifactSha256 };
}

function equalHex(left: string, right: string) {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export class ResearchModelAnalyzer implements Analyzer {
  readonly config: ResearchAnalyzerConfig;

  constructor(config: ResearchAnalyzerConfig = requiredConfig()) {
    this.config = config;
  }

  async analyze(input: AnalysisInput): Promise<ResearchAnalyzerResult> {
    const ageYears = input.ageYears;
    if (typeof ageYears !== "number" || !Number.isInteger(ageYears) || ageYears < 18 || ageYears > 85) {
      throw new ResearchInferenceError("invalid_inference_response");
    }

    const bytes = new Uint8Array(input.recording.bytes);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const requestId = randomUUID();
    const age = ageYears.toString();
    // The inference service signs the normalized MIME value so browser codec
    // parameters (which sometimes include spaces) remain interoperable.
    const mimeType = input.recording.mimeType.trim().toLowerCase().replaceAll(" ", "");
    const bodySha256 = createHash("sha256").update(bytes).digest("hex");
    const canonical = [
      "v1",
      timestamp,
      requestId,
      age,
      mimeType,
      bodySha256,
    ].join("\n");
    const signature = createHmac("sha256", this.config.secret)
      .update(canonical)
      .digest("hex");

    let response: Response;
    try {
      response = await fetch(new URL("/v1/analyze", this.config.url), {
        method: "POST",
        headers: {
          "Content-Type": mimeType,
          "X-SoundCue-Timestamp": timestamp,
          "X-SoundCue-Request-Id": requestId,
          "X-SoundCue-Age": age,
          "X-Content-SHA256": bodySha256,
          "X-SoundCue-Signature": signature,
        },
        body: bytes,
        cache: "no-store",
        signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new ResearchInferenceError("inference_timeout");
      }
      throw new ResearchInferenceError("inference_unavailable");
    }

    const payload: unknown = await response.json().catch(() => null);
    if (response.status === 422) {
      const parsedError = qualityErrorSchema.safeParse(payload);
      if (parsedError.success) {
        throw new ResearchInferenceError(
          "recording_quality_failed",
          parsedError.data.error.reasons,
        );
      }
    }
    if (!response.ok) throw new ResearchInferenceError("inference_unavailable");

    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) throw new ResearchInferenceError("invalid_inference_response");
    if (!equalHex(parsed.data.modelArtifactSha256, this.config.expectedArtifactSha256)) {
      throw new ResearchInferenceError("model_artifact_mismatch");
    }
    return parsed.data;
  }
}
