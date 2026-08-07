import type {
  AnalysisFinding,
  AnalysisInput,
  AnalysisResult,
  Analyzer,
  FindingLevel,
} from "@/types/screening";
import { assessRecordingQuality, clamp01, scoreToBand } from "./features";

export const DUMMY_ANALYZER_VERSION = "dummy-signal-v1";

function level(value: number, moderate: number, higher: number): FindingLevel {
  if (value >= higher) return "higher";
  if (value >= moderate) return "moderate";
  return "lower";
}

function deterministicNudge(input: AnalysisInput): number {
  const signature = [
    input.features.durationSeconds,
    input.features.rms,
    input.features.voicedCoverage,
    input.features.pitchVariation,
    input.features.jitter,
    input.features.shimmer,
    input.features.breathSupport,
  ]
    .map((value) => Math.round(value * 10_000))
    .join(":");

  let hash = 2166136261;
  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 101) / 10_000;
}

/**
 * Development-only deterministic adapter. Its weights are illustrative and are
 * not clinically validated. Production must use a validated Analyzer instead.
 */
export class DummySignalAnalyzer implements Analyzer {
  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    const { features } = input;
    const quality = assessRecordingQuality(features);

    const steadinessSignal = clamp01(
      features.jitter * 8 + features.shimmer * 3.2 + features.clippingRatio * 2,
    );
    const pitchSignal = clamp01(features.pitchVariation * 2.8);
    const breathSignal = clamp01(
      (1 - features.breathSupport) * 0.7 + (1 - features.voicedCoverage) * 0.3,
    );

    const score = clamp01(
      steadinessSignal * 0.42 +
        pitchSignal * 0.31 +
        breathSignal * 0.27 +
        deterministicNudge(input),
    );

    const findings: AnalysisFinding[] = [
      {
        code: "voice_steadiness",
        level: level(steadinessSignal, 0.34, 0.67),
      },
      {
        code: "pitch_variation",
        level: level(pitchSignal, 0.34, 0.67),
      },
      {
        code: "breath_support",
        level: level(breathSignal, 0.34, 0.67),
      },
    ];

    return {
      modelKind: "dummy",
      modelVersion: DUMMY_ANALYZER_VERSION,
      score,
      band: scoreToBand(score),
      findings,
      quality,
    };
  }
}
