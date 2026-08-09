import type { Analyzer } from "@/types/screening";
import { DummySignalAnalyzer } from "./dummy-signal-analyzer";
import { ResearchModelAnalyzer } from "./research-analyzer";

export { DummySignalAnalyzer } from "./dummy-signal-analyzer";
export { ResearchInferenceError, ResearchModelAnalyzer } from "./research-analyzer";
export type { ResearchAnalyzerResult } from "./research-analyzer";
export { assessRecordingQuality, clamp01, scoreToBand } from "./features";

export function getAnalyzer(): Analyzer {
  const kind = process.env.ANALYZER_MODE ?? "dummy";
  const isProduction = process.env.VERCEL_ENV
    ? process.env.VERCEL_ENV === "production"
    : process.env.NODE_ENV === "production";

  if (isProduction && kind !== "research") {
    throw new Error("RESEARCH_ANALYZER_REQUIRED_IN_PRODUCTION");
  }
  if (kind === "research") {
    return new ResearchModelAnalyzer();
  }
  if (kind === "dummy" && !isProduction) return new DummySignalAnalyzer();

  throw new Error("ANALYZER_NOT_CONFIGURED");
}
