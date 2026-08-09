import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ClinicianReportView } from "@/features/results/report/ClinicianReportView";
import { loadModelEvidence } from "@/features/results/report/model-evidence";
import {
  buildClinicianTrendReportModel,
  type ReportScreening,
} from "@/features/results/report/report-model";
import { getDisplayName, requireUser } from "@/lib/auth/current-user";
import { listCompletedScreenings } from "@/lib/screenings/data";

export const metadata: Metadata = {
  title: "Parkinson’s voice screening trend report",
};
export const dynamic = "force-dynamic";

export default async function ClinicianTrendReportPage() {
  const user = await requireUser();
  const [sessions, evidence] = await Promise.all([
    listCompletedScreenings(user.id),
    loadModelEvidence(),
  ]);
  const history = sessions.map(({ view }) => view as ReportScreening);
  if (!history.some((screening) => String(screening.analyzer_kind) === "research")) {
    notFound();
  }

  const model = buildClinicianTrendReportModel(history, evidence);

  return (
    <AppShell active="history" displayName={getDisplayName(user)}>
      <ClinicianReportView model={model} />
    </AppShell>
  );
}
