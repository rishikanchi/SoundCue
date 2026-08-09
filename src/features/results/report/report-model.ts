import {
  RESEARCH_ANALYSIS_COPY,
  RISK_BAND_COPY,
  SCREENING_DISCLAIMER,
  getFindingCopy,
  getResearchResultObservations,
  type ResearchObservation,
  type ResultObservation,
} from "@/lib/result-copy";
import type { RiskBand, ScreeningRecord, ScreeningView } from "@/types/screening";
import { getTrendGuidance } from "@/lib/trend-guidance";

export type ResearchScreeningFields = {
  age_years?: number | null;
  preprocessing_version?: string | null;
  band_policy_version?: string | null;
  model_artifact_sha256?: string | null;
  observations?: ResearchObservation[] | null;
};

export type ReportScreening = (ScreeningRecord | ScreeningView) & ResearchScreeningFields;

export type ModelEvidenceMetric = {
  label: string;
  value: string;
  detail?: string;
};

export type ModelEvidence = {
  modelVersion: string | null;
  artifactSha256: string | null;
  participants: number | null;
  metrics: ModelEvidenceMetric[];
  limitations: string[];
};

export type ReportHistoryPoint = {
  id: string;
  date: string;
  label: string;
  band: RiskBand;
  position: number;
};

export type ClinicianReportModel = {
  reportKind: "screening" | "trend";
  reportId: string;
  screeningId: string;
  sessionCount: number;
  generatedAt: string;
  recordedAt: string;
  completedAt: string;
  band: RiskBand;
  bandLabel: string;
  bandSummary: string;
  recommendationTitle: string;
  recommendation: string;
  spectrumPosition: number;
  ageYears: number | null;
  duration: string;
  modelKind: string;
  modelVersion: string;
  preprocessingVersion: string;
  bandPolicyVersion: string;
  artifactHash: string;
  observations: ResultObservation[];
  history: ReportHistoryPoint[];
  evidence: ModelEvidence;
  hasRecording: boolean;
  disclaimer: string;
  howItWorks: string;
  evidenceLimitations: string;
  clinicianQuestions: readonly string[];
};

const BAND_POSITION: Record<RiskBand, number> = {
  fewer: 18,
  some: 55,
  more: 84,
};

function asResearchFields(screening: ReportScreening): ResearchScreeningFields {
  return screening as ResearchScreeningFields;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function legacyObservations(screening: ReportScreening): ResultObservation[] {
  return (screening.findings ?? []).map((finding) => {
    const copy = getFindingCopy(finding.code, finding.level);
    return {
      code: "voice_steadiness" as const,
      title: copy.title,
      value:
        finding.level === "lower"
          ? "Lower range"
          : finding.level === "higher"
            ? "Higher range"
            : "Middle range",
      description: copy.description,
    };
  });
}

export function comparableHistory(
  screening: ReportScreening,
  history: ReportScreening[],
  options: { limit?: number } = { limit: 5 },
): ReportHistoryPoint[] {
  const current = asResearchFields(screening);
  if (String(screening.analyzer_kind) !== "research" || !current.band_policy_version) {
    return [];
  }

  const earlierSessions = history
    .filter((entry) => {
      const fields = asResearchFields(entry);
      return (
        entry.status === "completed" &&
        Boolean(entry.band) &&
        String(entry.analyzer_kind) === "research" &&
        fields.band_policy_version === current.band_policy_version &&
        entry.id !== screening.id
      );
    })
    .sort((a, b) => Date.parse(a.completed_at ?? a.created_at) - Date.parse(b.completed_at ?? b.created_at));
  const limitedEarlierSessions = typeof options.limit === "number"
    ? earlierSessions.slice(-Math.max(0, options.limit - 1))
    : earlierSessions;

  return limitedEarlierSessions
    .concat(screening)
    .sort((a, b) => Date.parse(a.completed_at ?? a.created_at) - Date.parse(b.completed_at ?? b.created_at))
    .map((entry) => {
      const band = entry.band as RiskBand;
      return {
        id: entry.id,
        date: entry.completed_at ?? entry.created_at,
        label: formatShortDate(entry.completed_at ?? entry.created_at),
        band,
        position: BAND_POSITION[band],
      };
    });
}

export function buildClinicianReportModel(
  screening: ReportScreening,
  history: ReportScreening[],
  evidence: ModelEvidence,
  generatedAt = new Date().toISOString(),
): ClinicianReportModel {
  if (screening.status !== "completed" || !screening.band) {
    throw new Error("SCREENING_RESULT_INCOMPLETE");
  }

  const fields = asResearchFields(screening);
  const isResearch = String(screening.analyzer_kind) === "research";
  const evidenceMatchesScreening =
    isResearch &&
    Boolean(screening.analyzer_version) &&
    screening.analyzer_version === evidence.modelVersion &&
    Boolean(fields.model_artifact_sha256) &&
    fields.model_artifact_sha256 === evidence.artifactSha256;
  const matchingEvidence: ModelEvidence = evidenceMatchesScreening
    ? evidence
    : {
        modelVersion: screening.analyzer_version ?? null,
        artifactSha256: fields.model_artifact_sha256 ?? null,
        participants: null,
        metrics: [],
        limitations: [],
      };
  const bandCopy = RISK_BAND_COPY[screening.band];
  const recordedAt = screening.created_at;
  const completedAt = screening.completed_at ?? screening.updated_at;
  const duration =
    typeof screening.duration_seconds === "number"
      ? `${screening.duration_seconds.toFixed(1)} seconds`
      : "Not available";

  return {
    reportKind: "screening",
    reportId: `SC-${screening.id.replace(/-/g, "").slice(0, 10).toUpperCase()}`,
    screeningId: screening.id,
    sessionCount: 1,
    generatedAt: formatDate(generatedAt),
    recordedAt: formatDate(recordedAt),
    completedAt: formatDate(completedAt),
    band: screening.band,
    bandLabel: bandCopy.label,
    bandSummary: isResearch
      ? `${bandCopy.summary} ${RESEARCH_ANALYSIS_COPY.referenceSummary}`
      : bandCopy.summary,
    recommendationTitle: "Suggested next step",
    recommendation: bandCopy.recommendation,
    spectrumPosition: BAND_POSITION[screening.band],
    ageYears: isResearch && typeof fields.age_years === "number" ? fields.age_years : null,
    duration,
    modelKind: String(screening.analyzer_kind ?? "not available"),
    modelVersion: screening.analyzer_version ?? matchingEvidence.modelVersion ?? "Not available",
    preprocessingVersion: fields.preprocessing_version ?? "Not available",
    bandPolicyVersion: fields.band_policy_version ?? "Not available",
    artifactHash: fields.model_artifact_sha256 ?? "Not available",
    observations: isResearch
      ? getResearchResultObservations(
          fields.observations,
          screening.quality,
          screening.duration_seconds,
        )
      : legacyObservations(screening),
    history: comparableHistory(screening, history),
    evidence: matchingEvidence,
    hasRecording: "hasRecording" in screening
      ? screening.hasRecording
      : Boolean(screening.recording_path),
    disclaimer: SCREENING_DISCLAIMER,
    howItWorks: isResearch
      ? RESEARCH_ANALYSIS_COPY.howItWorks
      : "This earlier session used SoundCue's development analyzer and is not comparable with research-model sessions.",
    evidenceLimitations: isResearch
      ? RESEARCH_ANALYSIS_COPY.evidenceLimitations
      : "This earlier session used development software. Its output must not be interpreted as research-model evidence.",
    clinicianQuestions: RESEARCH_ANALYSIS_COPY.clinicianQuestions,
  };
}

export function buildClinicianTrendReportModel(
  history: ReportScreening[],
  evidence: ModelEvidence,
  generatedAt = new Date().toISOString(),
): ClinicianReportModel {
  const researchSessions = history
    .filter((entry) => (
      entry.status === "completed" &&
      Boolean(entry.band) &&
      String(entry.analyzer_kind) === "research" &&
      Boolean(asResearchFields(entry).band_policy_version)
    ))
    .sort((a, b) => Date.parse(a.completed_at ?? a.created_at) - Date.parse(b.completed_at ?? b.created_at));
  const latest = researchSessions.at(-1);
  if (!latest) throw new Error("NO_RESEARCH_SCREENING_HISTORY");

  const base = buildClinicianReportModel(latest, history, evidence, generatedAt);
  const trendHistory = comparableHistory(latest, history, { limit: 6 });
  const guidance = getTrendGuidance(trendHistory.map((point) => point.band));

  return {
    ...base,
    reportKind: "trend",
    reportId: `TR-${latest.id.replace(/-/g, "").slice(0, 10).toUpperCase()}`,
    sessionCount: trendHistory.length,
    history: trendHistory,
    recommendationTitle: guidance.title,
    recommendation: guidance.body,
  };
}
