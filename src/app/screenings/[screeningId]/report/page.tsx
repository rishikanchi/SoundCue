import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ClinicianReportView } from "@/features/results/report/ClinicianReportView";
import { loadModelEvidence } from "@/features/results/report/model-evidence";
import {
  buildClinicianReportModel,
  type ReportScreening,
} from "@/features/results/report/report-model";
import { getDisplayName, requireUser } from "@/lib/auth/current-user";
import { getScreeningForUser, listCompletedScreenings } from "@/lib/screenings/data";

export const metadata: Metadata = { title: "Clinician screening summary" };
export const dynamic = "force-dynamic";

export default async function ClinicianReportPage({
  params,
}: {
  params: Promise<{ screeningId: string }>;
}) {
  const { screeningId } = await params;
  const user = await requireUser();
  const [screening, sessions, evidence] = await Promise.all([
    getScreeningForUser(screeningId, user.id),
    listCompletedScreenings(user.id),
    loadModelEvidence(),
  ]);

  if (
    !screening ||
    screening.status !== "completed" ||
    !screening.band ||
    String(screening.analyzer_kind) !== "research"
  ) notFound();

  const model = buildClinicianReportModel(
    screening as ReportScreening,
    sessions.map(({ view }) => view as ReportScreening),
    evidence,
  );

  return (
    <AppShell
      active="history"
      displayName={getDisplayName(user)}
      placeholder={String(screening.analyzer_kind) === "dummy"}
    >
      <ClinicianReportView model={model} />
    </AppShell>
  );
}
