import type { NextRequest } from "next/server";
import { getOwnedScreening, requireUser } from "../../../_lib/auth";
import { apiError } from "../../../_lib/http";
import { buildClinicianSummaryPdf } from "../../../_lib/pdf";
import { screeningIdSchema } from "../../../_lib/schemas";

type Context = { params: Promise<{ screeningId: string }> };

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
  if (screening.status !== "completed" || !screening.band) {
    return apiError(
      request,
      409,
      "summary_not_ready",
      "This screening summary is not ready yet.",
    );
  }

  const pdf = buildClinicianSummaryPdf(screening);
  const pdfBuffer = pdf.buffer.slice(
    pdf.byteOffset,
    pdf.byteOffset + pdf.byteLength,
  ) as ArrayBuffer;
  return new Response(pdfBuffer, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="soundcue-summary-${screening.id.slice(0, 8)}.pdf"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
