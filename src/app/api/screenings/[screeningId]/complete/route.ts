import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toScreeningView, type ScreeningRecord } from "@/types/screening";
import { getOwnedScreening, requireUser } from "../../../_lib/auth";
import { apiError, apiJson, assertSameOrigin } from "../../../_lib/http";
import {
  MAX_AUDIO_BYTES,
  acousticFeaturesSchema,
  audioExtension,
  screeningIdSchema,
  supportedAudioMimeType,
} from "../../../_lib/schemas";

type Context = { params: Promise<{ screeningId: string }> };

export async function POST(request: NextRequest, context: Context) {
  if (!assertSameOrigin(request)) {
    return apiError(request, 403, "invalid_origin", "This request was not accepted.");
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_AUDIO_BYTES + 1_048_576) {
    return apiError(
      request,
      413,
      "recording_too_large",
      "The recording is larger than the 10 MB limit.",
    );
  }
  const { user, response } = await requireUser(request);
  if (response) return response;

  const { screeningId } = await context.params;
  if (!screeningIdSchema.safeParse(screeningId).success) {
    return apiError(request, 404, "screening_not_found", "Screening not found.");
  }
  const screening = await getOwnedScreening(screeningId, user.id);
  if (!screening) {
    return apiError(request, 404, "screening_not_found", "Screening not found.");
  }
  if (screening.status !== "draft") {
    return apiError(
      request,
      409,
      "screening_already_uploaded",
      "This recording has already been submitted.",
    );
  }

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const metricsValue = form?.get("clientMetrics");
  if (!(audio instanceof File) || typeof metricsValue !== "string") {
    return apiError(
      request,
      400,
      "invalid_upload",
      "The recording upload was incomplete.",
    );
  }
  const mime = supportedAudioMimeType.safeParse(audio.type);
  if (!mime.success || audio.size <= 0 || audio.size > MAX_AUDIO_BYTES) {
    return apiError(
      request,
      415,
      "unsupported_recording",
      "This recording format or size is not supported.",
    );
  }
  const metrics = acousticFeaturesSchema.safeParse(
    (() => {
      try {
        return JSON.parse(metricsValue);
      } catch {
        return null;
      }
    })(),
  );
  if (!metrics.success) {
    return apiError(
      request,
      400,
      "invalid_acoustic_features",
      "We could not read the recording quality details.",
    );
  }
  const declaredMime = screening.recording_mime_type?.split(";", 1)[0];
  const actualMime = mime.data.split(";", 1)[0];
  if (
    (screening.recording_size_bytes != null &&
      screening.recording_size_bytes !== audio.size) ||
    (declaredMime != null && declaredMime !== actualMime)
  ) {
    return apiError(
      request,
      400,
      "recording_metadata_mismatch",
      "The recording details did not match the uploaded audio.",
    );
  }
  if (
    screening.duration_seconds != null &&
    Math.abs(screening.duration_seconds - metrics.data.durationSeconds) > 0.75
  ) {
    return apiError(
      request,
      400,
      "recording_duration_mismatch",
      "The recording details did not match the uploaded audio.",
    );
  }

  const admin = createAdminClient();
  const storageMime = actualMime;
  const path = `${user.id}/${screening.id}/source.${audioExtension(storageMime)}`;
  const { error: storageError } = await admin.storage
    .from("recordings")
    .upload(path, await audio.arrayBuffer(), {
      contentType: storageMime,
      cacheControl: "private, no-store",
      upsert: false,
    });
  if (storageError) {
    return apiError(
      request,
      503,
      "recording_upload_failed",
      "The recording could not be saved. Please try again.",
    );
  }

  const { data, error } = await admin
    .from("screenings")
    .update({
      status: "uploaded",
      recording_path: path,
      recording_mime_type: storageMime,
      recording_size_bytes: audio.size,
      duration_seconds: metrics.data.durationSeconds,
      feature_version: metrics.data.version,
      features: metrics.data,
      quality: null,
      failure_code: null,
    })
    .eq("id", screening.id)
    .eq("user_id", user.id)
    .eq("status", "draft")
    .select("*")
    .maybeSingle();

  if (error || !data) {
    await admin.storage.from("recordings").remove([path]);
    return apiError(
      request,
      503,
      "recording_finalize_failed",
      "The recording could not be finalized. Please try again.",
    );
  }
  return apiJson({ screening: toScreeningView(data as ScreeningRecord) });
}
