import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "../_lib/auth";
import {
  CURRENT_CONSENT_VERSION,
  hasCurrentConsent,
} from "../_lib/consent";
import { apiError, apiJson, assertSameOrigin } from "../_lib/http";

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  return apiJson({
    documentVersion: CURRENT_CONSENT_VERSION,
    accepted: await hasCurrentConsent(user.id),
  });
}

export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return apiError(request, 403, "invalid_origin", "This request was not accepted.");
  }
  const { user, response } = await requireUser(request);
  if (response) return response;

  if (!(await hasCurrentConsent(user.id))) {
    const admin = createAdminClient();
    const { error } = await admin.from("consent_events").insert({
      user_id: user.id,
      document_version: CURRENT_CONSENT_VERSION,
    });
    if (error && !(await hasCurrentConsent(user.id))) {
      return apiError(
        request,
        503,
        "consent_save_failed",
        "We could not save your consent. Please try again.",
      );
    }
  }

  return apiJson(
    { documentVersion: CURRENT_CONSENT_VERSION, accepted: true },
    { status: 201 },
  );
}
