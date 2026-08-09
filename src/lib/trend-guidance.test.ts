import { describe, expect, it } from "vitest";
import { getTrendGuidance } from "./trend-guidance";

describe("trend guidance", () => {
  it("directly recommends a clinician conversation for a latest more-patterns result", () => {
    expect(getTrendGuidance(["fewer", "some", "more"])).toMatchObject({
      level: "speak",
      title: "Speak with a clinician about this result.",
    });
  });

  it("suggests a conversation when comparable results vary", () => {
    expect(getTrendGuidance(["some", "fewer"])).toMatchObject({
      level: "consider",
      title: "Consider speaking with a clinician.",
    });
  });

  it("does not overstate stable fewer-pattern results", () => {
    expect(getTrendGuidance(["fewer", "fewer", "fewer"])).toMatchObject({
      level: "watch",
      title: "This trend does not call for a clinician visit on its own.",
    });
  });
});
