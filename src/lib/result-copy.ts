import type {
  FindingCode,
  FindingLevel,
  RiskBand,
} from "@/types/screening";

export const RISK_BAND_COPY: Record<
  RiskBand,
  { label: string; summary: string; recommendation: string }
> = {
  fewer: {
    label: "Fewer detected patterns",
    summary:
      "This recording contained fewer of the voice patterns this screening looks for.",
    recommendation:
      "If you have noticed changes in your voice, movement, or health, share those concerns with a healthcare professional regardless of this result.",
  },
  some: {
    label: "Some detected patterns",
    summary:
      "This recording contained some of the voice patterns this screening looks for.",
    recommendation:
      "Consider sharing this summary with a healthcare professional, especially if you have noticed other changes or symptoms.",
  },
  more: {
    label: "More detected patterns",
    summary:
      "This recording contained more of the voice patterns this screening looks for.",
    recommendation:
      "Please share this summary with a healthcare professional, who can consider it alongside your symptoms and medical history.",
  },
};

const FINDING_TITLES: Record<FindingCode, string> = {
  voice_steadiness: "Voice steadiness",
  pitch_variation: "Pitch variation",
  breath_support: "Breath support",
};

const FINDING_DESCRIPTIONS: Record<FindingCode, Record<FindingLevel, string>> = {
  voice_steadiness: {
    lower: "Your sustained voice remained relatively steady in this recording.",
    moderate: "Some changes in voice steadiness were detected in this recording.",
    higher: "More changes in voice steadiness were detected in this recording.",
  },
  pitch_variation: {
    lower: "Your pitch remained relatively consistent during the sustained sound.",
    moderate: "Some pitch variation was detected during the sustained sound.",
    higher: "More pitch variation was detected during the sustained sound.",
  },
  breath_support: {
    lower: "The sustained sound showed relatively consistent breath support.",
    moderate: "Some variation in breath support was detected in this recording.",
    higher: "More variation in breath support was detected in this recording.",
  },
};

export function getFindingCopy(code: FindingCode, level: FindingLevel) {
  return {
    title: FINDING_TITLES[code],
    description: FINDING_DESCRIPTIONS[code][level],
  };
}

export const SCREENING_DISCLAIMER =
  "SoundCue is a Parkinson’s voice screening aid, not a diagnosis. Only a qualified healthcare professional can assess your health and diagnose or rule out Parkinson’s disease.";

export type ResearchObservationCode =
  | "model_agreement"
  | "pitch_steadiness"
  | "loudness_stability"
  | "sound_continuity";

export type ResearchObservationLevel = "lower" | "middle" | "higher";

export interface ResearchObservation {
  code: ResearchObservationCode;
  level: ResearchObservationLevel;
}

export type ResultObservation = {
  code: "model_agreement" | "voice_steadiness" | "sound_continuity" | "recording_quality";
  title: string;
  value: string;
  description: string;
};

const COMPARISON_NOTE =
  "This measurement provides recording context. It does not explain why the research model assigned its category.";

function findObservation(
  observations: ResearchObservation[],
  code: ResearchObservationCode,
) {
  return observations.find((observation) => observation.code === code)?.level;
}

function movementLabel(level: ResearchObservationLevel | undefined) {
  if (level === "lower") return "Lower measured movement";
  if (level === "higher") return "Higher measured movement";
  return "Middle measured range";
}

export function getResearchResultObservations(
  observations: ResearchObservation[] | null | undefined,
  quality: { passed: boolean; reasons: string[] } | null | undefined,
  durationSeconds: number | null | undefined,
): ResultObservation[] {
  const safeObservations = observations ?? [];
  const agreement = findObservation(safeObservations, "model_agreement");
  const pitch = findObservation(safeObservations, "pitch_steadiness");
  const loudness = findObservation(safeObservations, "loudness_stability");
  const continuity = findObservation(safeObservations, "sound_continuity");

  const agreementValue =
    agreement === "higher"
      ? "Aligned"
      : agreement === "middle"
        ? "Mostly aligned"
        : agreement === "lower"
          ? "Mixed"
          : "Not available";

  const steadinessValue =
    pitch && loudness
      ? pitch === loudness
        ? movementLabel(pitch)
        : "Different movement ranges"
      : pitch || loudness
        ? movementLabel(pitch ?? loudness)
        : "Not available";

  const continuityValue =
    continuity === "higher"
      ? "More continuous"
      : continuity === "lower"
        ? "Less continuous"
        : continuity === "middle"
          ? "Middle measured range"
          : "Not available";

  const duration =
    typeof durationSeconds === "number" ? `${durationSeconds.toFixed(1)} seconds` : null;
  const qualityValue = quality?.passed ? "Suitable for analysis" : "Review recommended";
  const qualityDescription = quality?.passed
    ? `The recording${duration ? ` lasted ${duration} and` : ""} met the automated sound-quality checks used before analysis.`
    : "One or more automated sound-quality checks could not be confirmed. A new recording may provide a clearer sample.";

  return [
    {
      code: "model_agreement",
      title: "Model agreement",
      value: agreementValue,
      description:
        agreementValue === "Not available"
          ? "Agreement between the three analysis views was not available for this session."
          : `The three analysis views were ${agreementValue.toLowerCase()} in the category ranges they identified.`,
    },
    {
      code: "voice_steadiness",
      title: "Voice steadiness",
      value: steadinessValue,
      description:
        steadinessValue === "Not available"
          ? "Pitch and loudness movement measurements were not available for this session."
          : `Pitch and loudness movement were compared with the internal development reference. ${COMPARISON_NOTE}`,
    },
    {
      code: "sound_continuity",
      title: "Sound continuity",
      value: continuityValue,
      description:
        continuityValue === "Not available"
          ? "Sound-continuity measurements were not available for this session."
          : `This describes how consistently the sustained sound remained voiced. ${COMPARISON_NOTE}`,
    },
    {
      code: "recording_quality",
      title: "Recording quality",
      value: qualityValue,
      description: qualityDescription,
    },
  ];
}

export const RESEARCH_ANALYSIS_COPY = {
  referenceSummary:
    "SoundCue combined this recording with the age entered for this Parkinson’s voice screening. The category shows where the resulting pattern falls within an internal development reference; it is not a probability or diagnosis.",
  contextNote:
    "The recording observations provide context about this voice sample. They are not causal explanations of the embedding-based research model.",
  howItWorks:
    "The Parkinson’s voice research model uses three analysis views of the sustained recording. Two use an Audio Spectrogram Transformer and one uses WavLM; age at screening is combined with each view before their category ranges are brought together.",
  evidenceLimitations:
    "The research model was developed using recordings from 81 participants. The development data had a substantial age imbalance and the model has not completed independent clinical validation.",
  clinicianQuestions: [
    "Could changes in my voice relate to another condition, medication, or temporary factor?",
    "Should my voice, movement, or neurological health be assessed further?",
    "Would repeating this screening later add useful context?",
  ],
} as const;
