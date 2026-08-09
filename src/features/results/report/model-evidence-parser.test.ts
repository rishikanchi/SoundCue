import { describe, expect, it } from "vitest";
import { parseModelEvidence } from "./model-evidence-parser";

describe("model evidence manifest mapping", () => {
  it("maps the canonical manifest without hardcoding performance values", () => {
    const evidence = parseModelEvidence({
      model: {
        version: "research-v-test",
        artifact: { sha256: "artifact-test" },
      },
      validation: {
        developmentCohort: { participants: 81 },
        primary: { rocAuc: 0.91234 },
        bootstrap95: { low: 0.81, high: 0.97 },
        repeatedFiveFold: { meanRocAuc: 0.87654 },
        thresholdAtPoint5: {
          accuracy: 0.9,
          sensitivity: 0.8,
          specificity: 0.7,
        },
        limitations: ["Internal evidence only."],
      },
    });

    expect(evidence.modelVersion).toBe("research-v-test");
    expect(evidence.artifactSha256).toBe("artifact-test");
    expect(evidence.participants).toBe(81);
    expect(evidence.metrics).toEqual([
      {
        label: "Leave-one-participant-out ROC AUC",
        value: "0.9123",
        detail: "Bootstrap 95% interval 0.8100-0.9700",
      },
      { label: "Repeated five-fold mean ROC AUC", value: "0.8765" },
      { label: "Accuracy", value: "90.0%" },
      { label: "Sensitivity", value: "80.0%" },
      { label: "Specificity", value: "70.0%" },
    ]);
  });

  it("fails to an empty evidence state for malformed input", () => {
    expect(parseModelEvidence(null)).toEqual({
      modelVersion: null,
      artifactSha256: null,
      participants: null,
      metrics: [],
      limitations: [],
    });
  });
});
