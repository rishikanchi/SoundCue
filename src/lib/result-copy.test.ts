import { describe, expect, it } from "vitest";
import { FINDING_CODES, FINDING_LEVELS, RISK_BANDS } from "../types/screening";
import {
  RISK_BAND_COPY,
  getFindingCopy,
  getResearchResultObservations,
} from "./result-copy";

describe("reviewed result copy", () => {
  it("covers every risk band without a numeric claim", () => {
    for (const band of RISK_BANDS) {
      const copy = RISK_BAND_COPY[band];
      expect(copy.label).toBeTruthy();
      expect(`${copy.label} ${copy.summary} ${copy.recommendation}`).not.toMatch(/\d+%/);
    }
  });

  it("covers each finding and level", () => {
    for (const code of FINDING_CODES) {
      for (const level of FINDING_LEVELS) {
        expect(getFindingCopy(code, level).description.length).toBeGreaterThan(20);
      }
    }
  });

  it("maps research observations to reviewed, non-causal copy", () => {
    const observations = getResearchResultObservations(
      [
        { code: "model_agreement", level: "higher" },
        { code: "pitch_steadiness", level: "lower" },
        { code: "loudness_stability", level: "higher" },
        { code: "sound_continuity", level: "middle" },
      ],
      { passed: true, reasons: [] },
      6.2,
    );

    expect(observations).toHaveLength(4);
    expect(observations[0]).toMatchObject({ title: "Model agreement", value: "Aligned" });
    expect(observations[1].value).toBe("Different movement ranges");
    expect(observations[3].description).toContain("6.2 seconds");
    expect(observations.map(({ description }) => description).join(" ")).not.toMatch(
      /caused|probability|diagnosis of/i,
    );
  });
});
