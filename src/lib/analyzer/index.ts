import type { Analyzer } from "@/types/screening";
import { DummySignalAnalyzer } from "./dummy-signal-analyzer";

export { DummySignalAnalyzer } from "./dummy-signal-analyzer";
export { assessRecordingQuality, clamp01, scoreToBand } from "./features";

export function getAnalyzer(): Analyzer {
  const kind = process.env.ANALYZER_MODE ?? "dummy";
  const isProduction = process.env.VERCEL_ENV
    ? process.env.VERCEL_ENV === "production"
    : process.env.NODE_ENV === "production";
  const hostedDummyExplicitlyAllowed =
    process.env.SOUNDCUE_ALLOW_HOSTED_DUMMY === "true";

  if (kind === "dummy" && isProduction && !hostedDummyExplicitlyAllowed) {
    throw new Error("DUMMY_ANALYZER_DISABLED_IN_PRODUCTION");
  }
  if (kind !== "dummy") {
    throw new Error("VALIDATED_ANALYZER_NOT_CONFIGURED");
  }

  return new DummySignalAnalyzer();
}
