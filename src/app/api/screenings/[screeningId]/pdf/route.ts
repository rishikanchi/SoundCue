import type { NextRequest } from "next/server";
import { loadModelEvidence } from "@/features/results/report/model-evidence";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScreeningRecord } from "@/types/screening";
import { getOwnedScreening, requireUser } from "../../../_lib/auth";
import { apiError } from "../../../_lib/http";
import { buildClinicianSummaryPdf } from "../../../_lib/pdf";
import { screeningIdSchema } from "../../../_lib/schemas";

type Context = { params: Promise<{ screeningId: string }> };

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: Context) {
  const { user, response } = await requireUser(request);
  if (response) return response;

  const { screeningId } = await context.params;
  if (!screeningIdSchema.safeParse(screeningId).success) {
    return apiError(request, 404, "screening_not_found", "Screening not found.");
  }
  const screening = await getOwnedScreening(screeningId, user.id);
  if (!screening) {
    return apiError(request, 404, "screening_not_found", "Screening not found.");
  }
  if (
    screening.status !== "completed" ||
    !screening.band ||
    String(screening.analyzer_kind) !== "research"
  ) {
    return apiError(
      request,
      404,
      "screening_not_found",
      "Screening not found.",
    );
  }

  const admin = createAdminClient();
  const [{ data: historyData }, evidence] = await Promise.all([
    admin
      .from("screenings")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    loadModelEvidence(),
  ]);
  const pdf = await buildClinicianSummaryPdf(
    screening,
    (historyData ?? []) as ScreeningRecord[],
    evidence,
  );
  const pdfBuffer = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  return new Response(pdfBuffer, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="soundcue-summary-${screening.id.slice(0, 8)}.pdf"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
