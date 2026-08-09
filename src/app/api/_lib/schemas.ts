import { z } from "zod";
import {
  ACOUSTIC_FEATURE_VERSION,
  FINDING_CODES,
  FINDING_LEVELS,
  MODEL_COMPONENT_CODES,
  OBSERVATION_CODES,
  OBSERVATION_LEVELS,
  RISK_BANDS,
} from "../../../types/screening";

export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MIN_DURATION_SECONDS = 5;
/** Allows a small MediaRecorder stop/flush tolerance beyond the seven-second target. */
export const MAX_DURATION_SECONDS = 7.5;
export const MIN_SCREENING_AGE = 18;
export const MAX_SCREENING_AGE = 85;

export const supportedAudioMimeType = z.string().transform((value, context) => {
  const normalized = value.toLowerCase().trim();
  if (normalized.length > 128 || /[\r\n\0]/.test(normalized)) {
    context.addIssue({
      code: "custom",
      message: "Unsupported audio format.",
    });
    return z.NEVER;
  }
  const base = normalized.split(";", 1)[0];
  if (!["audio/webm", "audio/ogg", "audio/mp4", "audio/wav"].includes(base)) {
    context.addIssue({
      code: "custom",
      message: "Unsupported audio format.",
    });
    return z.NEVER;
  }
  return normalized;
});

export const ageYearsSchema = z
  .number()
  .int()
  .min(MIN_SCREENING_AGE)
  .max(MAX_SCREENING_AGE);

export const createScreeningSchema = z
  .object({
    ageYears: ageYearsSchema,
    durationSeconds: z
      .number()
      .finite()
      .min(MIN_DURATION_SECONDS)
      .max(MAX_DURATION_SECONDS),
    mimeType: supportedAudioMimeType,
    sizeBytes: z.number().int().positive().max(MAX_AUDIO_BYTES),
  })
  .strict();

export const acousticFeaturesSchema = z
  .object({
    version: z.literal(ACOUSTIC_FEATURE_VERSION),
    durationSeconds: z
      .number()
      .finite()
      .min(MIN_DURATION_SECONDS)
      .max(MAX_DURATION_SECONDS),
    sampleRate: z.number().int().min(8_000).max(192_000),
    rms: z.number().finite().min(0).max(1),
    peakAmplitude: z.number().finite().min(0).max(1.5),
    voicedCoverage: z.number().finite().min(0).max(1),
    clippingRatio: z.number().finite().min(0).max(1),
    pitchMeanHz: z.number().finite().min(40).max(1_200).nullable(),
    pitchVariation: z.number().finite().min(0).max(2),
    jitter: z.number().finite().min(0).max(1),
    shimmer: z.number().finite().min(0).max(1),
    breathSupport: z.number().finite().min(0).max(1),
  })
  .strict();

export const deleteAccountSchema = z.object({ confirmation: z.literal("DELETE") });

export const screeningIdSchema = z.string().uuid();

const boundedVersion = z.string().trim().min(1).max(100);
const riskBandSchema = z.enum(RISK_BANDS);

export const analysisFindingSchema = z
  .object({
    code: z.enum(FINDING_CODES),
    level: z.enum(FINDING_LEVELS),
  })
  .strict();

export const analysisObservationSchema = z
  .object({
    code: z.enum(OBSERVATION_CODES),
    level: z.enum(OBSERVATION_LEVELS),
  })
  .strict();

export const modelComponentResultSchema = z
  .object({
    code: z.enum(MODEL_COMPONENT_CODES),
    score: z.number().finite().min(0).max(1),
    band: riskBandSchema,
  })
  .strict();

export const researchTechnicalMetricsSchema = z
  .object({
    pitchSemitoneIqr: z.number().finite().nonnegative().nullable(),
    loudnessVariationDb: z.number().finite().nonnegative().nullable(),
    voicedCoverage: z.number().finite().min(0).max(1),
    clippingRatio: z.number().finite().min(0).max(1),
    durationSeconds: z
      .number()
      .finite()
      .min(MIN_DURATION_SECONDS)
      .max(MAX_DURATION_SECONDS),
  })
  .strict();

function hasUniqueCodes(items: ReadonlyArray<{ code: string }>, expected: number) {
  return new Set(items.map(({ code }) => code)).size === expected;
}

const researchFindingsSchema = z
  .array(analysisFindingSchema)
  .length(FINDING_CODES.length)
  .refine((items) => hasUniqueCodes(items, FINDING_CODES.length), {
    message: "Each finding code must appear exactly once.",
  });

const researchObservationsSchema = z
  .array(analysisObservationSchema)
  .length(OBSERVATION_CODES.length)
  .refine((items) => hasUniqueCodes(items, OBSERVATION_CODES.length), {
    message: "Each observation code must appear exactly once.",
  });

const researchComponentsSchema = z
  .array(modelComponentResultSchema)
  .length(MODEL_COMPONENT_CODES.length)
  .refine((items) => hasUniqueCodes(items, MODEL_COMPONENT_CODES.length), {
    message: "Each model component code must appear exactly once.",
  });

/** Strict schema for the normalized research result persisted by the web app. */
export const researchAnalysisResultSchema = z
  .object({
    modelKind: z.literal("research"),
    modelVersion: boundedVersion,
    score: z.number().finite().min(0).max(1),
    band: riskBandSchema,
    findings: researchFindingsSchema,
    quality: z
      .object({
        passed: z.boolean(),
        reasons: z.array(z.string().trim().min(1).max(100)).max(10),
      })
      .strict(),
    preprocessingVersion: boundedVersion,
    bandPolicyVersion: boundedVersion,
    modelArtifactSha256: z.string().regex(/^[0-9a-f]{64}$/),
    components: researchComponentsSchema,
    observations: researchObservationsSchema,
    technicalMetrics: researchTechnicalMetricsSchema,
  })
  .strict();

export function audioExtension(mimeType: string): string {
  const base = mimeType.toLowerCase().split(";", 1)[0];
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/mp4") return "m4a";
  if (base === "audio/wav") return "wav";
  return "webm";
}
