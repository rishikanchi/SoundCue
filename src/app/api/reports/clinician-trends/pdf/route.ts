import type { NextRequest } from "next/server";
import { loadModelEvidence } from "@/features/results/report/model-evidence";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScreeningRecord } from "@/types/screening";
import { requireUser } from "@/app/api/_lib/auth";
import { apiError } from "@/app/api/_lib/http";
import { buildClinicianTrendPdf } from "@/app/api/_lib/pdf";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  const admin = createAdminClient();
  const [{ data, error }, evidence] = await Promise.all([
    admin
      .from("screenings")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    loadModelEvidence(),
  ]);
  const history = (data ?? []) as ScreeningRecord[];
  if (
    error ||
    !history.some((screening) => (
      screening.status === "completed" &&
      Boolean(screening.band) &&
      String(screening.analyzer_kind) === "research"
    ))
  ) {
    return apiError(request, 404, "report_not_found", "A clinician trend report is not available yet.");
  }

  const pdf = await buildClinicianTrendPdf(history, evidence);
  const pdfBuffer = pdf.buffer.slice(
    pdf.byteOffset,
    pdf.byteOffset + pdf.byteLength,
  ) as ArrayBuffer;

  return new Response(pdfBuffer, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="soundcue-parkinsons-trend-report.pdf"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
