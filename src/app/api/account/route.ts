import type { NextRequest } from "next/server";
import { deleteAccountResources, DeletionFailure } from "@/lib/deletion";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "../_lib/auth";
import { apiError, assertSameOrigin } from "../_lib/http";
import { deleteAccountSchema } from "../_lib/schemas";

const RECENT_AUTH_WINDOW_MS = 15 * 60 * 1000;

export async function DELETE(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return apiError(request, 403, "invalid_origin", "This request was not accepted.");
  }
  const { user, response } = await requireUser(request);
  if (response) return response;

  const parsed = deleteAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      request,
      400,
      "confirmation_required",
      "Type DELETE to confirm permanent account deletion.",
    );
  }

  const signedInAt = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0;
  if (!signedInAt || Date.now() - signedInAt > RECENT_AUTH_WINDOW_MS) {
    return apiError(
      request,
      403,
      "reauthentication_required",
      "Please sign in again before permanently deleting your account.",
    );
  }

  const admin = createAdminClient();
  const { data: screenings, error: screeningError } = await admin
    .from("screenings")
    .select("recording_path")
    .eq("user_id", user.id);
  if (screeningError) {
    return apiError(
      request,
      503,
      "account_delete_failed",
      "We could not delete your account yet. Please try again.",
    );
  }

  const paths = (screenings ?? [])
    .map((screening: { recording_path: string | null }) => screening.recording_path)
    .filter((path): path is string => Boolean(path));
  try {
    await deleteAccountResources({
      recordingPaths: paths,
      removeRecordings: async (batch) => {
        const { error } = await admin.storage.from("recordings").remove(batch);
        if (error) throw new Error("storage_unavailable");
      },
      deleteAuthUser: async () => {
        const { error } = await admin.auth.admin.deleteUser(user.id);
        if (error) throw new Error("auth_unavailable");
      },
    });
  } catch (error) {
    const storageFailed = error instanceof DeletionFailure && error.code === "recording_delete_failed";
    return apiError(
      request,
      503,
      storageFailed ? "recording_delete_failed" : "account_delete_failed",
      storageFailed
        ? "We could not delete all recordings yet. Please try again."
        : "We could not finish deleting your account. Please try again.",
    );
  }

  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
