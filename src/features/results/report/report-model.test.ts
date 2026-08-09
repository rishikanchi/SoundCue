import { describe, expect, it } from "vitest";
import type { ScreeningView } from "@/types/screening";
import {
  buildClinicianReportModel,
  buildClinicianTrendReportModel,
  comparableHistory,
} from "./report-model";

function screening(overrides: Partial<ScreeningView> = {}): ScreeningView {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    status: "completed",
    recording_mime_type: "audio/webm",
    recording_size_bytes: 128_000,
    duration_seconds: 6.2,
    feature_version: "audio-features-v1",
    quality: { passed: true, reasons: [] },
    analyzer_kind: "research",
    analyzer_version: "soundcue-research-3c-age-v1.0.0",
    band: "some",
    findings: [],
    age_years: 64,
    preprocessing_version: "audio-8k-to-16k-v1",
    band_policy_version: "development-tertiles-v1",
    model_artifact_sha256: "abc123",
    observations: [
      { code: "model_agreement", level: "higher" },
      { code: "pitch_steadiness", level: "middle" },
      { code: "loudness_stability", level: "middle" },
      { code: "sound_continuity", level: "higher" },
    ],
    failure_code: null,
    is_synthetic: false,
    created_at: "2026-08-08T12:00:00.000Z",
    updated_at: "2026-08-08T12:01:00.000Z",
    completed_at: "2026-08-08T12:01:00.000Z",
    hasRecording: true,
    ...overrides,
  };
}

const evidence = {
  modelVersion: "soundcue-research-3c-age-v1.0.0",
  artifactSha256: "abc123",
  participants: 81,
  metrics: [{ label: "Leave-one-participant-out ROC AUC", value: "0.8123" }],
  limitations: ["Internal development evidence only."],
};

describe("clinician report model", () => {
  it("builds a research report without exposing an internal score or email", () => {
    const model = buildClinicianReportModel(
      screening(),
      [],
      evidence,
      "2026-08-08T13:00:00.000Z",
    );

    expect(model.reportId).toBe("SC-1111111111");
    expect(model.bandLabel).toBe("Some detected patterns");
    expect(model.ageYears).toBe(64);
    expect(model.observations).toHaveLength(4);
    expect(model.history).toHaveLength(1);
    expect(model).not.toHaveProperty("score");
    expect(JSON.stringify(model)).not.toContain("@");
  });

  it("keeps history to the same research category policy and excludes dummy sessions", () => {
    const current = screening();
    const compatible = screening({
      id: "22222222-2222-4222-8222-222222222222",
      band: "fewer",
      completed_at: "2026-08-01T12:01:00.000Z",
    });
    const stalePolicy = screening({
      id: "33333333-3333-4333-8333-333333333333",
      band_policy_version: "development-tertiles-v0",
    });
    const dummy = screening({
      id: "44444444-4444-4444-8444-444444444444",
      analyzer_kind: "dummy",
      band_policy_version: null,
    });

    expect(comparableHistory(current, [compatible, stalePolicy, dummy])).toEqual([
      expect.objectContaining({ id: compatible.id, band: "fewer" }),
      expect.objectContaining({ id: current.id, band: "some" }),
    ]);
  });

  it("preserves reviewed legacy findings for dummy sessions", () => {
    const legacy = screening({
      analyzer_kind: "dummy",
      analyzer_version: "dummy-signal-v1",
      age_years: null,
      preprocessing_version: null,
      band_policy_version: null,
      model_artifact_sha256: null,
      observations: null,
      findings: [{ code: "voice_steadiness", level: "moderate" }],
    });
    const model = buildClinicianReportModel(legacy, [], evidence);
    expect(model.observations[0].title).toBe("Voice steadiness");
    expect(model.history).toEqual([]);
  });

  it("does not attach current evidence to a result from another artifact", () => {
    const model = buildClinicianReportModel(
      screening({ model_artifact_sha256: "older-artifact" }),
      [],
      evidence,
    );

    expect(model.evidence.metrics).toEqual([]);
    expect(model.evidence.participants).toBeNull();
    expect(model.evidence.artifactSha256).toBe("older-artifact");
  });

  it("builds a trend-first clinician report from comparable research sessions", () => {
    const earlier = screening({
      id: "22222222-2222-4222-8222-222222222222",
      band: "fewer",
      completed_at: "2026-08-01T12:01:00.000Z",
    });
    const latest = screening({
      id: "33333333-3333-4333-8333-333333333333",
      band: "more",
      completed_at: "2026-08-08T12:01:00.000Z",
    });
    const model = buildClinicianTrendReportModel([earlier, latest], evidence);

    expect(model.reportKind).toBe("trend");
    expect(model.reportId).toMatch(/^TR-/);
    expect(model.sessionCount).toBe(2);
    expect(model.history.map((point) => point.band)).toEqual(["fewer", "more"]);
    expect(model.recommendationTitle).toBe("Speak with a clinician about this result.");
  });
});
