import { describe, expect, it } from "vitest";
import { FINDING_CODES, FINDING_LEVELS, RISK_BANDS } from "../types/screening";
import { RISK_BAND_COPY, getFindingCopy } from "./result-copy";

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
});
