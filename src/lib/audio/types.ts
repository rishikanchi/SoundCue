export const AUDIO_FEATURE_VERSION = "audio-features-v1" as const;

export type AudioQualityIssueCode =
  | "too_short"
  | "silence"
  | "low_input"
  | "clipping";

export interface AudioFeatures {
  version: typeof AUDIO_FEATURE_VERSION;
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
  /** A zero-to-one signal proxy based on amplitude stability and decay. */
  breathSupport: number;
}

export interface AudioQualityIssue {
  code: AudioQualityIssueCode;
  message: string;
  guidance: string;
}

export interface AudioQualityReport {
  version: "audio-quality-v1";
  acceptable: boolean;
  issues: AudioQualityIssue[];
}

export interface AcceptedRecording {
  blob: Blob;
  mimeType: string;
  extension: "webm" | "ogg" | "mp4";
  durationSeconds: number;
  /** A compact, normalized preview. It is not used for analysis. */
  waveformSamples: number[];
  features: AudioFeatures;
  quality: AudioQualityReport;
}

export type RecordingPhase =
  | "idle"
  | "requesting_permission"
  | "countdown"
  | "recording"
  | "processing"
  | "review"
  | "error";

export type MicrophonePermission = "unknown" | "prompt" | "granted" | "denied";

export type RecordingErrorCode =
  | "unsupported_browser"
  | "permission_denied"
  | "microphone_unavailable"
  | "recording_failed"
  | "audio_processing_failed";

export interface RecordingError {
  code: RecordingErrorCode;
  message: string;
}
