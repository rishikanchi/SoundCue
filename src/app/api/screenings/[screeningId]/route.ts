import type { NextRequest } from "next/server";
import { deleteScreeningResources, DeletionFailure } from "@/lib/deletion";
import { createAdminClient } from "@/lib/supabase/admin";
import { toScreeningView } from "@/types/screening";
import { getOwnedScreening, requireUser } from "../../_lib/auth";
import { apiError, apiJson, assertSameOrigin } from "../../_lib/http";
import { screeningIdSchema } from "../../_lib/schemas";

type Context = { params: Promise<{ screeningId: string }> };

async function resolveOwned(request: NextRequest, context: Context) {
  const { user, response } = await requireUser(request);
  if (response) return { response, screening: null, user: null } as const;

  const { screeningId } = await context.params;
  if (!screeningIdSchema.safeParse(screeningId).success) {
    return {
      response: apiError(request, 404, "screening_not_found", "Screening not found."),
      screening: null,
      user,
    } as const;
  }
  const screening = await getOwnedScreening(screeningId, user.id);
  if (!screening) {
    return {
      response: apiError(request, 404, "screening_not_found", "Screening not found."),
      screening: null,
      user,
    } as const;
  }
  return { response: null, screening, user } as const;
}

export async function GET(request: NextRequest, context: Context) {
  const { response, screening } = await resolveOwned(request, context);
  if (response || !screening) return response;
  return apiJson({ screening: toScreeningView(screening) });
}

export async function DELETE(request: NextRequest, context: Context) {
  if (!assertSameOrigin(request)) {
    return apiError(request, 403, "invalid_origin", "This request was not accepted.");
  }
  const { response, screening, user } = await resolveOwned(request, context);
  if (response || !screening || !user) return response;

  const admin = createAdminClient();
  try {
    await deleteScreeningResources({
      recordingPath: screening.recording_path,
      removeRecording: async (path) => {
        const { error } = await admin.storage.from("recordings").remove([path]);
        if (error) throw new Error("storage_unavailable");
      },
      deleteRow: async () => {
        const { error } = await admin.from("screenings").delete().eq("id", screening.id).eq("user_id", user.id);
        if (error) throw new Error("database_unavailable");
      },
    });
  } catch (error) {
    const storageFailed = error instanceof DeletionFailure && error.code === "recording_delete_failed";
    return apiError(
      request,
      503,
      storageFailed ? "recording_delete_failed" : "screening_delete_failed",
      storageFailed
        ? "We could not delete this screening yet. Please try again."
        : "We could not finish deleting this screening. Please try again.",
    );
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
