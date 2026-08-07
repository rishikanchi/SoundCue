import {
  PLACEHOLDER_ANALYSIS_NOTICE,
  RISK_BAND_COPY,
  SCREENING_DISCLAIMER,
  getFindingCopy,
} from "@/lib/result-copy";
import type { ScreeningRecord } from "@/types/screening";

function ascii(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "-")
    .replace(/([\\()])/g, "\\$1");
}

function wrap(value: string, width = 78): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function buildClinicianSummaryPdf(screening: ScreeningRecord): Uint8Array {
  if (!screening.band || !screening.findings) {
    throw new Error("SCREENING_RESULT_INCOMPLETE");
  }

  const band = RISK_BAND_COPY[screening.band];
  const lines = [
    "SoundCue - Screening summary",
    `Recorded: ${new Date(screening.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    })}`,
    "",
    band.label,
    ...wrap(band.summary),
    "",
    "Voice observations",
    ...screening.findings.flatMap((finding) => {
      const copy = getFindingCopy(finding.code, finding.level);
      return [`${copy.title}:`, ...wrap(copy.description)];
    }),
    "",
    "Suggested next step",
    ...wrap(band.recommendation),
    "",
    ...wrap(SCREENING_DISCLAIMER),
    ...(screening.analyzer_kind === "dummy"
      ? ["", ...wrap(PLACEHOLDER_ANALYSIS_NOTICE)]
      : []),
  ];

  const textCommands = lines
    .slice(0, 45)
    .map((line) => `(${ascii(line)}) Tj T*`)
    .join("\n");
  const stream = `BT\n/F1 11 Tf\n15 TL\n60 742 Td\n${textCommands}\nET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(new TextEncoder().encode(output).length);
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(output).length;
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  output += `startxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(output);
}
