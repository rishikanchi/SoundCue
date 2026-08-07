import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ScreeningRecord } from "@/types/screening";
import { apiError } from "./http";

export async function requireUser(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      response: apiError(
        request,
        401,
        "authentication_required",
        "Please sign in to continue.",
      ),
    } as const;
  }

  return { user, response: null } as const;
}

export async function getOwnedScreening(
  screeningId: string,
  userId: string,
): Promise<ScreeningRecord | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("screenings")
    .select("*")
    .eq("id", screeningId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ScreeningRecord;
}
