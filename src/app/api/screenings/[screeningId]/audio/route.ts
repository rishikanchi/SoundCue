import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnedScreening, requireUser } from "../../../_lib/auth";
import { apiError } from "../../../_lib/http";
import { screeningIdSchema } from "../../../_lib/schemas";

type Context = { params: Promise<{ screeningId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  const { screeningId } = await context.params;
  if (!screeningIdSchema.safeParse(screeningId).success) {
    return apiError(request, 404, "recording_not_found", "Recording not found.");
  }
  const screening = await getOwnedScreening(screeningId, user.id);
  if (!screening?.recording_path || screening.is_synthetic) {
    return apiError(request, 404, "recording_not_found", "Recording not found.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("recordings")
    .download(screening.recording_path);
  if (error || !data) {
    return apiError(
      request,
      503,
      "recording_unavailable",
      "This recording is temporarily unavailable.",
    );
  }

  return new Response(data, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": screening.recording_mime_type ?? "application/octet-stream",
      "Content-Length": String(data.size),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
