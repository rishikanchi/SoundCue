import type { ScreeningRecord } from "@/types/screening";
import { renderClinicianReportPdf } from "@/features/results/report/ClinicianReportDocument";
import {
  buildClinicianReportModel,
  buildClinicianTrendReportModel,
  type ModelEvidence,
  type ReportScreening,
} from "@/features/results/report/report-model";

export async function buildClinicianSummaryPdf(
  screening: ScreeningRecord,
  history: ScreeningRecord[],
  evidence: ModelEvidence,
): Promise<Buffer> {
  const model = buildClinicianReportModel(
    screening as ReportScreening,
    history as ReportScreening[],
    evidence,
  );
  return renderClinicianReportPdf(model);
}

export async function buildClinicianTrendPdf(
  history: ScreeningRecord[],
  evidence: ModelEvidence,
): Promise<Buffer> {
  const model = buildClinicianTrendReportModel(
    history as ReportScreening[],
    evidence,
  );
  return renderClinicianReportPdf(model);
}
