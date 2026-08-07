import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { HistoryView, type HistorySession } from "@/features/history/HistoryView";
import { getDisplayName, requireUser } from "@/lib/auth/current-user";
import { listCompletedScreenings } from "@/lib/screenings/data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { RiskBand, ScreeningView } from "@/types/screening";

export const metadata: Metadata = { title: "Your screening history" };

function sampleHistory(): HistorySession[] {
  const bands: RiskBand[] = ["some", "fewer", "some", "more", "some"];
  return bands.map((band,index) => {
    const created = new Date(2026, 2 + index, 9 + index * 3, 10, 30).toISOString();
    const view: ScreeningView = {
      id: `00000000-0000-4000-8000-00000000000${index}`,
      status:"completed",recording_mime_type:null,recording_size_bytes:null,duration_seconds:8.2,
      feature_version:"audio-features-v1",quality:{passed:true,reasons:[]},analyzer_kind:"dummy",analyzer_version:"dummy-signal-v1",
      band,findings:[],failure_code:null,is_synthetic:true,created_at:created,updated_at:created,completed_at:created,hasRecording:false,
    };
    return { view, spectrumPosition: [0.54,0.30,0.48,0.70,0.58][index] };
  });
}

export default async function HistoryPage() {
  if (!isSupabaseConfigured()) {
    return <AppShell active="history" displayName="Sample" placeholder><HistoryView sessions={sampleHistory()} sample /></AppShell>;
  }
  const user = await requireUser();
  const sessions = await listCompletedScreenings(user.id);
  return <AppShell active="history" displayName={getDisplayName(user)} placeholder={sessions.some(({view}) => view.analyzer_kind === "dummy")}><HistoryView sessions={sessions} /></AppShell>;
}
