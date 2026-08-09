import { describe, expect, it } from "vitest";
import { renderClinicianReportPdf } from "./ClinicianReportDocument";
import type { ClinicianReportModel } from "./report-model";

const model: ClinicianReportModel = {
  reportKind: "screening",
  reportId: "SC-TESTREPORT",
  screeningId: "11111111-1111-4111-8111-111111111111",
  sessionCount: 1,
  generatedAt: "August 8, 2026 at 1:00 PM UTC",
  recordedAt: "August 8, 2026 at 12:00 PM UTC",
  completedAt: "August 8, 2026 at 12:01 PM UTC",
  band: "some",
  bandLabel: "Some detected patterns",
  bandSummary: "This sample falls in the middle category of the development reference. It is not a probability or diagnosis.",
  recommendationTitle: "Suggested next step",
  recommendation: "Share this summary with a healthcare professional if you have concerns.",
  spectrumPosition: 55,
  ageYears: 64,
  duration: "6.2 seconds",
  modelKind: "research",
  modelVersion: "research-test-v1",
  preprocessingVersion: "preprocessing-test-v1",
  bandPolicyVersion: "policy-test-v1",
  artifactHash: "abc123",
  observations: [
    { code: "model_agreement", title: "Model agreement", value: "Aligned", description: "The three analysis views were aligned." },
    { code: "voice_steadiness", title: "Voice steadiness", value: "Middle measured range", description: "Pitch and loudness movement provide recording context." },
    { code: "sound_continuity", title: "Sound continuity", value: "More continuous", description: "The sustained sound remained voiced consistently." },
    { code: "recording_quality", title: "Recording quality", value: "Suitable for analysis", description: "The sample passed automated quality checks." },
  ],
  history: [
    { id: "april", date: "2026-04-08T12:00:00Z", label: "Apr 8, 2026", band: "fewer", position: 18 },
    { id: "may", date: "2026-05-08T12:00:00Z", label: "May 8, 2026", band: "some", position: 55 },
    { id: "june", date: "2026-06-08T12:00:00Z", label: "Jun 8, 2026", band: "some", position: 55 },
    { id: "july", date: "2026-07-08T12:00:00Z", label: "Jul 8, 2026", band: "more", position: 84 },
    { id: "current", date: "2026-08-08T12:00:00Z", label: "Aug 8, 2026", band: "some", position: 55 },
  ],
  evidence: {
    modelVersion: "research-test-v1",
    artifactSha256: "abc123",
    participants: 81,
    metrics: [
      { label: "Leave-one-participant-out ROC AUC", value: "0.8123" },
      { label: "Repeated five-fold mean ROC AUC", value: "0.7791" },
      { label: "Accuracy", value: "80.0%" },
      { label: "Sensitivity", value: "81.0%" },
      { label: "Specificity", value: "79.0%" },
    ],
    limitations: [
      "No external, prospective, site, microphone, or recording-session validation.",
      "Development representation and model choices used the same 81-participant dataset.",
      "The development cohorts were substantially age imbalanced.",
    ],
  },
  hasRecording: true,
  disclaimer: "SoundCue is a screening aid, not a diagnosis.",
  howItWorks: "Three analysis views examine different representations of the sustained voice recording.",
  evidenceLimitations: "The research model has not completed independent clinical validation.",
  clinicianQuestions: [
    "Could changes in my voice relate to another condition, medication, or temporary factor?",
    "Should my voice, movement, or neurological health be assessed further?",
    "Would repeating this screening later add useful context?",
  ],
};

describe("clinician report PDF", () => {
  it("renders a compact three-page PDF using local font assets", async () => {
    const pdf = await renderClinicianReportPdf(model);
    const source = pdf.toString("latin1");

    expect(source.startsWith("%PDF-")).toBe(true);
    expect(source.match(/\/Type \/Page\b/g)).toHaveLength(3);
    expect(pdf.byteLength).toBeLessThan(2 * 1024 * 1024);
    expect(source).toContain("SoundCue Parkinson's voice screening clinician summary SC-TESTREPORT");
    expect(source).toMatch(/\/Author \d+ 0 R/);
    expect(source).toContain("/ToUnicode");
  });

  it("renders the trend report as a distinct three-page clinician artifact", async () => {
    const pdf = await renderClinicianReportPdf({
      ...model,
      reportKind: "trend",
      reportId: "TR-TESTREPORT",
      sessionCount: model.history.length,
      recommendationTitle: "Consider speaking with a clinician.",
    });
    const source = pdf.toString("latin1");

    expect(source.match(/\/Type \/Page\b/g)).toHaveLength(3);
    expect(source).toContain("SoundCue Parkinson's voice screening trend report TR-TESTREPORT");
  });
});
