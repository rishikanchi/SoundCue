import type { Metadata } from "next";
import { SoundCueLogo } from "@/components/brand/logo";
import { DisclaimerBar } from "@/components/layout/disclaimer-bar";
import { AnalysisExperience } from "@/features/screening/AnalysisExperience";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Analyzing your voice" };

export default async function AnalyzingPage({
  params,
}: PageProps<"/screenings/[screeningId]/analyzing">) {
  const { screeningId } = await params;
  const preview = !isSupabaseConfigured() && screeningId === "preview";
  if (!preview) await requireUser();
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ minHeight: 104, display: "grid", placeItems: "center", borderBottom: "1px solid var(--border)" }}>
        <SoundCueLogo />
      </header>
      <main id="main-content" style={{ flex: 1 }}>
        <AnalysisExperience preview={preview} screeningId={screeningId} />
      </main>
      <DisclaimerBar />
    </div>
  );
}
