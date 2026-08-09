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

export const ANALYZER_KINDS = ["dummy", "research", "validated"] as const;
export type AnalyzerKind = (typeof ANALYZER_KINDS)[number];

export const OBSERVATION_CODES = [
  "model_agreement",
  "pitch_steadiness",
  "loudness_stability",
  "sound_continuity",
] as const;
export type ObservationCode = (typeof OBSERVATION_CODES)[number];

export const OBSERVATION_LEVELS = ["lower", "middle", "higher"] as const;
export type ObservationLevel = (typeof OBSERVATION_LEVELS)[number];

export const MODEL_COMPONENT_CODES = [
  "ast_layer_3",
  "ast_layer_6",
  "wavlm_layer_1",
] as const;
export type ModelComponentCode = (typeof MODEL_COMPONENT_CODES)[number];

export const RESEARCH_PREPROCESSING_VERSION = "research-audio-v1" as const;
export const RESEARCH_BAND_POLICY_VERSION = "development-tertiles-v1" as const;

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
  /** Required by the research adapter; ignored by the legacy dummy adapter. */
  ageYears?: number;
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

export interface ModelComponentResult {
  code: ModelComponentCode;
  /** Trusted-server output. Never include this value in ScreeningView. */
  score: number;
  band: RiskBand;
}

export interface AnalysisObservation {
  code: ObservationCode;
  level: ObservationLevel;
}

export interface ResearchTechnicalMetrics {
  pitchSemitoneIqr: number | null;
  loudnessVariationDb: number | null;
  voicedCoverage: number;
  clippingRatio: number;
  durationSeconds: number;
}

export interface ResearchAnalysisResult extends AnalysisResult {
  modelKind: "research";
  preprocessingVersion: string;
  bandPolicyVersion: string;
  modelArtifactSha256: string;
  components: ModelComponentResult[];
  observations: AnalysisObservation[];
  technicalMetrics: ResearchTechnicalMetrics;
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
  age_years: number | null;
  preprocessing_version: string | null;
  band_policy_version: string | null;
  model_artifact_sha256: string | null;
  observations: AnalysisObservation[] | null;
  failure_code: string | null;
  is_synthetic: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** Service-role-only row. Do not return this shape from browser-facing APIs. */
export interface ScreeningModelOutputRecord {
  screening_id: string;
  ensemble_score: number;
  component_scores: ModelComponentResult[];
  technical_metrics: ResearchTechnicalMetrics;
  inference_duration_ms: number;
  created_at: string;
}

export type AnalysisRunStatus = "started" | "completed" | "failed";

/** Coarse operational audit row; intentionally excludes result and identity data. */
export interface AnalysisRunRecord {
  id: string;
  screening_id: string;
  request_id: string;
  status: AnalysisRunStatus;
  analyzer_version: string | null;
  duration_ms: number | null;
  error_code: string | null;
  created_at: string;
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
    age_years: screening.age_years,
    preprocessing_version: screening.preprocessing_version,
    band_policy_version: screening.band_policy_version,
    model_artifact_sha256: screening.model_artifact_sha256,
    observations: screening.observations,
    failure_code: screening.failure_code,
    is_synthetic: screening.is_synthetic,
    created_at: screening.created_at,
    updated_at: screening.updated_at,
    completed_at: screening.completed_at,
    hasRecording: Boolean(screening.recording_path),
  };
}
