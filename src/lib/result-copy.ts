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
  "SoundCue is a screening aid, not a diagnosis. Only a qualified healthcare professional can assess your health and make a diagnosis.";

export const PLACEHOLDER_ANALYSIS_NOTICE =
  "Placeholder analysis — this result was produced by development software that has not been clinically validated.";
