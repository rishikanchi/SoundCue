export const SCREENING_STATUSES = [
  "draft",
  "uploaded",
  "processing",
  "needs_rerecord",
  "completed",
  "failed",
] as const;

export type ScreeningStatus = (typeof SCREENING_STATUSES)[number];

export const RISK_BANDS = ["fewer", "some", "more"] as const;
export type RiskBand = (typeof RISK_BANDS)[number];

export const FINDING_CODES = [
  "voice_steadiness",
  "pitch_variation",
  "breath_support",
] as const;
export type FindingCode = (typeof FINDING_CODES)[number];

export const FINDING_LEVELS = ["lower", "moderate", "higher"] as const;
export type FindingLevel = (typeof FINDING_LEVELS)[number];

export type AnalyzerKind = "dummy" | "validated";

export const ACOUSTIC_FEATURE_VERSION = "audio-features-v1" as const;

export interface AcousticFeatures {
  version: typeof ACOUSTIC_FEATURE_VERSION;
  durationSeconds: number;
  sampleRate: number;
  rms: number;
  peakAmplitude: number;
  voicedCoverage: number;
  clippingRatio: number;
  pitchMeanHz: number | null;
  pitchVariation: number;
  jitter: number;
  shimmer: number;
  breathSupport: number;
}

export interface RecordingQuality {
  passed: boolean;
  reasons: string[];
}

export interface AnalysisInput {
  durationSeconds: number;
  features: AcousticFeatures;
  /** The private source recording, available to a future validated adapter. */
  recording: {
    bytes: ArrayBuffer;
    mimeType: string;
  };
  /** Decoded mono PCM may be supplied by tests or a future server decoder. */
  samples?: Float32Array;
}

export interface AnalysisFinding {
  code: FindingCode;
  level: FindingLevel;
}

export interface AnalysisResult {
  modelKind: AnalyzerKind;
  modelVersion: string;
  /** Internal spectrum location. Never present this number to end users. */
  score: number;
  band: RiskBand;
  findings: AnalysisFinding[];
  quality: RecordingQuality;
}

export interface Analyzer {
  analyze(input: AnalysisInput): Promise<AnalysisResult>;
}

export interface ScreeningRecord {
  id: string;
  user_id: string;
  status: ScreeningStatus;
  recording_path: string | null;
  recording_mime_type: string | null;
  recording_size_bytes: number | null;
  duration_seconds: number | null;
  feature_version: string | null;
  features: AcousticFeatures | null;
  quality: RecordingQuality | null;
  analyzer_kind: AnalyzerKind | null;
  analyzer_version: string | null;
  score: number | null;
  band: RiskBand | null;
  findings: AnalysisFinding[] | null;
  failure_code: string | null;
  is_synthetic: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** A deliberately limited, safe-to-return representation. */
export type ScreeningView = Omit<
  ScreeningRecord,
  "user_id" | "recording_path" | "score" | "features"
> & {
  hasRecording: boolean;
};

export function toScreeningView(screening: ScreeningRecord): ScreeningView {
  return {
    id: screening.id,
    status: screening.status,
    recording_mime_type: screening.recording_mime_type,
    recording_size_bytes: screening.recording_size_bytes,
    duration_seconds: screening.duration_seconds,
    feature_version: screening.feature_version,
    quality: screening.quality,
    analyzer_kind: screening.analyzer_kind,
    analyzer_version: screening.analyzer_version,
    band: screening.band,
    findings: screening.findings,
    failure_code: screening.failure_code,
    is_synthetic: screening.is_synthetic,
    created_at: screening.created_at,
    updated_at: screening.updated_at,
    completed_at: screening.completed_at,
    hasRecording: Boolean(screening.recording_path),
  };
}
