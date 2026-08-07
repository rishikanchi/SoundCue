import { z } from "zod";
import { ACOUSTIC_FEATURE_VERSION } from "../../../types/screening";

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MIN_DURATION_SECONDS = 5;
export const MAX_DURATION_SECONDS = 12.5;

export const supportedAudioMimeType = z.string().transform((value, context) => {
  const normalized = value.toLowerCase().trim();
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

export const createScreeningSchema = z.object({
  durationSeconds: z.number().finite().positive().max(MAX_DURATION_SECONDS),
  mimeType: supportedAudioMimeType,
  sizeBytes: z.number().int().positive().max(MAX_AUDIO_BYTES),
});

export const acousticFeaturesSchema = z
  .object({
    version: z.literal(ACOUSTIC_FEATURE_VERSION),
    durationSeconds: z.number().finite().positive().max(MAX_DURATION_SECONDS),
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

export function audioExtension(mimeType: string): string {
  const base = mimeType.toLowerCase().split(";", 1)[0];
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/mp4") return "m4a";
  if (base === "audio/wav") return "wav";
  return "webm";
}
