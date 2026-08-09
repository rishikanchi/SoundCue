import { describe, expect, it } from "vitest";
import { toScreeningView, type ScreeningRecord } from "./screening";

describe("screening public view", () => {
  it("keeps reviewed research context and withholds private score data", () => {
    const screening: ScreeningRecord = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      user_id: "11111111-1111-4111-8111-111111111111",
      status: "completed",
      recording_path:
        "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/source.webm",
      recording_mime_type: "audio/webm",
      recording_size_bytes: 2048,
      duration_seconds: 6.1,
      feature_version: "audio-features-v1",
      features: null,
      quality: { passed: true, reasons: [] },
      analyzer_kind: "research",
      analyzer_version: "three-component-v1",
      score: null,
      band: "some",
      findings: [
        { code: "voice_steadiness", level: "moderate" },
        { code: "pitch_variation", level: "lower" },
        { code: "breath_support", level: "higher" },
      ],
      age_years: 64,
      preprocessing_version: "research-audio-v1",
      band_policy_version: "development-tertiles-v1",
      model_artifact_sha256: "a".repeat(64),
      observations: [
        { code: "model_agreement", level: "middle" },
        { code: "pitch_steadiness", level: "higher" },
        { code: "loudness_stability", level: "middle" },
        { code: "sound_continuity", level: "higher" },
      ],
      failure_code: null,
      is_synthetic: false,
      created_at: "2026-08-08T12:00:00.000Z",
      updated_at: "2026-08-08T12:01:00.000Z",
      completed_at: "2026-08-08T12:01:00.000Z",
    };

    const view = toScreeningView(screening);

    expect(view).toMatchObject({
      analyzer_kind: "research",
      age_years: 64,
      band_policy_version: "development-tertiles-v1",
      observations: screening.observations,
      hasRecording: true,
    });
    expect(view).not.toHaveProperty("score");
    expect(view).not.toHaveProperty("features");
    expect(view).not.toHaveProperty("recording_path");
    expect(view).not.toHaveProperty("user_id");
  });
});
