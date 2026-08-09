import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toScreeningView, type ScreeningRecord } from "@/types/screening";
import { requireUser } from "../_lib/auth";
import { CURRENT_CONSENT_VERSION, hasCurrentConsent } from "../_lib/consent";
import { apiError, apiJson, assertSameOrigin } from "../_lib/http";
import { createScreeningSchema } from "../_lib/schemas";

export async function POST(request: NextRequest) {
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
      "Please review and accept the current screening consent before recording.",
      { "X-Consent-Version": CURRENT_CONSENT_VERSION },
    );
  }

  const admin = createAdminClient();
  const { data: rateRows, error: rateError } = await admin.rpc(
    "consume_screening_rate_limit",
    {
      p_user_id: user.id,
      p_scope: "screening_create",
      p_limit: 6,
      p_window_seconds: 60 * 60,
    },
  );
  const rate = (rateRows as Array<{ allowed: boolean; retry_after_seconds: number }> | null)?.[0];
  if (rateError || !rate) {
    return apiError(
      request,
      503,
      "screening_limit_unavailable",
      "We could not start the screening safely. Please try again.",
    );
  }
  if (!rate.allowed) {
    return apiError(
      request,
      429,
      "screening_rate_limited",
      "Please wait before starting another screening.",
      { "Retry-After": String(rate.retry_after_seconds) },
    );
  }

  const parsed = createScreeningSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      request,
      400,
      "invalid_screening_metadata",
      "The recording details were not valid.",
    );
  }

  const { data, error } = await admin
    .from("screenings")
    .insert({
      user_id: user.id,
      status: "draft",
      duration_seconds: parsed.data.durationSeconds,
      recording_mime_type: parsed.data.mimeType,
      recording_size_bytes: parsed.data.sizeBytes,
      age_years: parsed.data.ageYears,
      is_synthetic: false,
    })
    .select("*")
    .single();

  if (error || !data) {
    return apiError(
      request,
      503,
      "screening_create_failed",
      "We could not start the screening. Please try again.",
    );
  }

  return apiJson(
    { screening: toScreeningView(data as ScreeningRecord) },
    { status: 201 },
  );
}
