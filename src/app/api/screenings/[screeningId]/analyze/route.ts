import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  getAnalyzer,
  ResearchInferenceError,
  type ResearchAnalyzerResult,
} from "@/lib/analyzer";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResearchAnalysisResult, ScreeningRecord } from "@/types/screening";
import { toScreeningView } from "@/types/screening";
import { getOwnedScreening, requireUser } from "../../../_lib/auth";
import { CURRENT_CONSENT_VERSION, hasCurrentConsent } from "../../../_lib/consent";
import { apiError, apiJson, assertSameOrigin } from "../../../_lib/http";
import { acousticFeaturesSchema, screeningIdSchema } from "../../../_lib/schemas";

type Context = { params: Promise<{ screeningId: string }> };
const PROCESSING_LEASE_SECONDS = 120;
const ANALYSIS_LIMIT_PER_HOUR = 12;

function elapsedMilliseconds(startedAt: number) {
  return Math.min(120_000, Math.max(0, Math.round(performance.now() - startedAt)));
}

function researchResult(result: ResearchAnalysisResult): ResearchAnalyzerResult {
  return result as ResearchAnalyzerResult;
}

export async function POST(request: NextRequest, context: Context) {
  if (!assertSameOrigin(request)) {
    return apiError(request, 403, "invalid_origin", "This request was not accepted.");
  }
  const { user, response } = await requireUser(request);
  if (response) return response;
  if (!(await hasCurrentConsent(user.id))) {
    return apiError(
      request,
      403,
      "current_consent_required",
      "Please review and accept the current screening consent before analysis.",
      { "X-Consent-Version": CURRENT_CONSENT_VERSION },
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

  const parsedFeatures = acousticFeaturesSchema.safeParse(screening.features);
  if (!parsedFeatures.success || !screening.recording_path || screening.age_years == null) {
    return apiError(
      request,
      409,
      "screening_data_incomplete",
      "This recording needs to be submitted again.",
    );
  }

  const admin = createAdminClient();
  const { data: rateRows, error: rateError } = await admin.rpc(
    "consume_screening_rate_limit",
    {
      p_user_id: user.id,
      p_scope: "screening_analyze",
      p_limit: ANALYSIS_LIMIT_PER_HOUR,
      p_window_seconds: 60 * 60,
    },
  );
  const rate = (rateRows as Array<{ allowed: boolean; retry_after_seconds: number }> | null)?.[0];
  if (rateError || !rate) {
    return apiError(
      request,
      503,
      "analysis_limit_unavailable",
      "Analysis is temporarily unavailable. Your recording is safe; please try again.",
    );
  }
  if (!rate.allowed) {
    return apiError(
      request,
      429,
      "analysis_rate_limited",
      "Please wait before trying the analysis again.",
      { "Retry-After": String(rate.retry_after_seconds) },
    );
  }

  const { data: claimedRows, error: claimError } = await admin.rpc(
    "claim_screening_for_analysis",
    {
      p_screening_id: screening.id,
      p_user_id: user.id,
      p_stale_after_seconds: PROCESSING_LEASE_SECONDS,
    },
  );
  const claimed = (claimedRows as ScreeningRecord[] | null)?.[0];
  if (claimError || !claimed) {
    return apiError(
      request,
      409,
      "analysis_already_started",
      "Analysis has already started for this recording.",
    );
  }

  const runId = randomUUID();
  const startedAt = performance.now();
  const { error: runStartError } = await admin.from("analysis_runs").insert({
    screening_id: screening.id,
    request_id: runId,
    status: "started",
  });
  if (runStartError) {
    await admin
      .from("screenings")
      .update({ status: "failed", failure_code: "analysis_audit_unavailable" })
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

  try {
    const { data: recording, error: recordingError } = await admin.storage
      .from("recordings")
      .download(screening.recording_path);
    if (recordingError || !recording) throw new Error("recording_unavailable");

    const analyzer = getAnalyzer();
    const result = await analyzer.analyze({
      ageYears: screening.age_years,
      durationSeconds: parsedFeatures.data.durationSeconds,
      features: parsedFeatures.data,
      recording: {
        bytes: await recording.arrayBuffer(),
        mimeType: screening.recording_mime_type ?? "application/octet-stream",
      },
    });
    const completedAt = new Date().toISOString();

    if (result.modelKind === "research") {
      const research = researchResult(result as ResearchAnalysisResult);
      const inferenceDurationMs = Math.min(
        120_000,
        Math.max(0, Math.round(research.inferenceDurationMs)),
      );
      const technicalMetrics = {
        pitchSemitoneIqr: research.technicalMetrics.pitchSemitoneIqr,
        loudnessVariationDb: research.technicalMetrics.loudnessVariationDb,
        voicedCoverage: research.technicalMetrics.voicedCoverage,
        clippingRatio: research.technicalMetrics.clippingRatio,
        durationSeconds: research.technicalMetrics.durationSeconds,
      };
      const { error: outputError } = await admin
        .from("screening_model_outputs")
        .upsert({
          screening_id: screening.id,
          ensemble_score: research.score,
          component_scores: research.components,
          technical_metrics: technicalMetrics,
          inference_duration_ms: inferenceDurationMs,
        }, { onConflict: "screening_id" });
      if (outputError) throw new Error("model_output_save_failed");

      const { data, error } = await admin
        .from("screenings")
        .update({
          status: "completed",
          quality: research.quality,
          analyzer_kind: "research",
          analyzer_version: research.modelVersion,
          score: null,
          band: research.band,
          findings: research.findings,
          preprocessing_version: research.preprocessingVersion,
          band_policy_version: research.bandPolicyVersion,
          model_artifact_sha256: research.modelArtifactSha256,
          observations: research.observations,
          failure_code: null,
          completed_at: completedAt,
        })
        .eq("id", screening.id)
        .eq("user_id", user.id)
        .eq("status", "processing")
        .select("*")
        .single();
      if (error || !data) throw new Error("analysis_save_failed");

      await admin
        .from("analysis_runs")
        .update({
          status: "completed",
          analyzer_version: research.modelVersion,
          duration_ms: elapsedMilliseconds(startedAt),
          completed_at: completedAt,
        })
        .eq("request_id", runId)
        .eq("status", "started");
      return apiJson({ screening: toScreeningView(data as ScreeningRecord) });
    }

    // Local-only deterministic sessions remain supported for development and
    // are deliberately excluded from research history and reports.
    const { data, error } = await admin
      .from("screenings")
      .update({
        status: result.quality.passed ? "completed" : "needs_rerecord",
        quality: result.quality,
        analyzer_kind: result.modelKind,
        analyzer_version: result.modelVersion,
        score: result.quality.passed ? result.score : null,
        band: result.quality.passed ? result.band : null,
        findings: result.quality.passed ? result.findings : null,
        failure_code: null,
        completed_at: completedAt,
      })
      .eq("id", screening.id)
      .eq("user_id", user.id)
      .eq("status", "processing")
      .select("*")
      .single();
    if (error || !data) throw new Error("analysis_save_failed");
    await admin
      .from("analysis_runs")
      .update({
        status: "completed",
        analyzer_version: result.modelVersion,
        duration_ms: elapsedMilliseconds(startedAt),
        completed_at: completedAt,
      })
      .eq("request_id", runId)
      .eq("status", "started");
    return apiJson({ screening: toScreeningView(data as ScreeningRecord) });
  } catch (error) {
    const completedAt = new Date().toISOString();
    const researchError = error instanceof ResearchInferenceError ? error : null;
    const needsRerecord = researchError?.code === "recording_quality_failed";
    const errorCode = researchError?.code ?? "analysis_unavailable";
    await admin
      .from("screenings")
      .update({
        status: needsRerecord ? "needs_rerecord" : "failed",
        quality: needsRerecord
          ? { passed: false, reasons: researchError?.reasons ?? [] }
          : screening.quality,
        failure_code: needsRerecord ? null : errorCode,
        completed_at: needsRerecord ? completedAt : null,
      })
      .eq("id", screening.id)
      .eq("user_id", user.id)
      .eq("status", "processing");
    await admin
      .from("analysis_runs")
      .update({
        status: "failed",
        duration_ms: elapsedMilliseconds(startedAt),
        error_code: errorCode,
        completed_at: completedAt,
      })
      .eq("request_id", runId)
      .eq("status", "started");

    if (needsRerecord) {
      const rerecord = await getOwnedScreening(screening.id, user.id);
      if (rerecord) return apiJson({ screening: toScreeningView(rerecord) });
    }
    return apiError(
      request,
      503,
      "analysis_unavailable",
      "Analysis is temporarily unavailable. Your recording is safe; please try again.",
    );
  }
}
