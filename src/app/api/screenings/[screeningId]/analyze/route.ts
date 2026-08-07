import type { NextRequest } from "next/server";
import { getAnalyzer } from "@/lib/analyzer";
import { createAdminClient } from "@/lib/supabase/admin";
import { toScreeningView, type ScreeningRecord } from "@/types/screening";
import { getOwnedScreening, requireUser } from "../../../_lib/auth";
import { apiError, apiJson, assertSameOrigin } from "../../../_lib/http";
import { consumeRateLimit } from "../../../_lib/rate-limit";
import { acousticFeaturesSchema, screeningIdSchema } from "../../../_lib/schemas";

type Context = { params: Promise<{ screeningId: string }> };
const PROCESSING_LEASE_MS = 2 * 60 * 1000;

export async function POST(request: NextRequest, context: Context) {
  if (!assertSameOrigin(request)) {
    return apiError(request, 403, "invalid_origin", "This request was not accepted.");
  }
  const { user, response } = await requireUser(request);
  if (response) return response;

  const rate = consumeRateLimit(`screening:analyze:${user.id}`, 12, 60 * 60 * 1000);
  if (!rate.allowed) {
    return apiError(
      request,
      429,
      "analysis_rate_limited",
      "Please wait before trying the analysis again.",
      { "Retry-After": String(rate.retryAfterSeconds) },
    );
  }

  const { screeningId } = await context.params;
  if (!screeningIdSchema.safeParse(screeningId).success) {
    return apiError(request, 404, "screening_not_found", "Screening not found.");
  }
  const screening = await getOwnedScreening(screeningId, user.id);
  if (!screening) {
    return apiError(request, 404, "screening_not_found", "Screening not found.");
  }
  if (screening.status === "completed" || screening.status === "needs_rerecord") {
    return apiJson({ screening: toScreeningView(screening) });
  }
  const processingIsStale =
    screening.status === "processing" &&
    Date.now() - Date.parse(screening.updated_at) > PROCESSING_LEASE_MS;
  if (
    screening.status !== "uploaded" &&
    screening.status !== "failed" &&
    !processingIsStale
  ) {
    return apiError(
      request,
      409,
      "screening_not_ready",
      "This recording is not ready to analyze.",
    );
  }

  const parsedFeatures = acousticFeaturesSchema.safeParse(screening.features);
  if (!parsedFeatures.success || !screening.recording_path) {
    return apiError(
      request,
      409,
      "screening_data_incomplete",
      "This recording needs to be submitted again.",
    );
  }

  const admin = createAdminClient();
  let claim = admin
    .from("screenings")
    .update({ status: "processing", failure_code: null })
    .eq("id", screening.id)
    .eq("user_id", user.id);
  claim = processingIsStale
    ? claim
        .eq("status", "processing")
        .lt("updated_at", new Date(Date.now() - PROCESSING_LEASE_MS).toISOString())
    : claim.in("status", ["uploaded", "failed"]);
  const { data: claimed, error: claimError } = await claim
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) {
    return apiError(
      request,
      409,
      "analysis_already_started",
      "Analysis has already started for this recording.",
    );
  }

  try {
    const { data: recording, error: recordingError } = await admin.storage
      .from("recordings")
      .download(screening.recording_path);
    if (recordingError || !recording) throw new Error("RECORDING_UNAVAILABLE");

    const analyzer = getAnalyzer();
    const result = await analyzer.analyze({
      durationSeconds: parsedFeatures.data.durationSeconds,
      features: parsedFeatures.data,
      recording: {
        bytes: await recording.arrayBuffer(),
        mimeType: screening.recording_mime_type ?? "application/octet-stream",
      },
    });
    const status = result.quality.passed ? "completed" : "needs_rerecord";
    const completedAt = new Date().toISOString();
    const values = result.quality.passed
      ? {
          status,
          quality: result.quality,
          analyzer_kind: result.modelKind,
          analyzer_version: result.modelVersion,
          score: result.score,
          band: result.band,
          findings: result.findings,
          failure_code: null,
          completed_at: completedAt,
        }
      : {
          status,
          quality: result.quality,
          analyzer_kind: result.modelKind,
          analyzer_version: result.modelVersion,
          score: null,
          band: null,
          findings: null,
          failure_code: null,
          completed_at: completedAt,
        };
    const { data, error } = await admin
      .from("screenings")
      .update(values)
      .eq("id", screening.id)
      .eq("user_id", user.id)
      .eq("status", "processing")
      .select("*")
      .single();

    if (error || !data) throw new Error("ANALYSIS_SAVE_FAILED");
    return apiJson({ screening: toScreeningView(data as ScreeningRecord) });
  } catch {
    await admin
      .from("screenings")
      .update({ status: "failed", failure_code: "analysis_unavailable" })
      .eq("id", screening.id)
      .eq("user_id", user.id)
      .eq("status", "processing");
    return apiError(
      request,
      503,
      "analysis_unavailable",
      "Analysis is temporarily unavailable. Your recording is safe; please try again.",
    );
  }
}
