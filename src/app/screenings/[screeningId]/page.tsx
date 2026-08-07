import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ResultExperience } from "@/features/results/ResultExperience";
import { getDisplayName, requireUser } from "@/lib/auth/current-user";
import { getScreeningForUser } from "@/lib/screenings/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Your screening result" };

export default async function ResultPage({
  params,
}: PageProps<"/screenings/[screeningId]">) {
  const { screeningId } = await params;
  const preview = !isSupabaseConfigured() && screeningId === "preview";

  if (preview) {
    return <AppShell quietHeader placeholder><ResultExperience preview /></AppShell>;
  }

  const user = await requireUser();
  const screening = await getScreeningForUser(screeningId, user.id);
  if (!screening) notFound();

  return (
    <AppShell active="history" displayName={getDisplayName(user)} placeholder={screening.analyzer_kind === "dummy"}>
      <ResultExperience initialScreening={screening} />
    </AppShell>
  );
}
