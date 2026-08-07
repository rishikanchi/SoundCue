import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ScreeningRecord, ScreeningView } from "@/types/screening";
import { toScreeningView } from "@/types/screening";

export async function getScreeningForUser(
  screeningId: string,
  userId: string,
): Promise<ScreeningView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("screenings")
    .select("*")
    .eq("id", screeningId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return toScreeningView(data as ScreeningRecord);
}

export async function listCompletedScreenings(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("screenings")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) return [];
  return (data as ScreeningRecord[]).map((record) => ({
    view: toScreeningView(record),
    spectrumPosition: Math.max(0, Math.min(1, record.score ?? 0.5)),
  }));
}
