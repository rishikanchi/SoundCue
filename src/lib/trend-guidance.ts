import type { RiskBand } from "@/types/screening";

export type TrendGuidance = {
  level: "speak" | "consider" | "watch";
  title: string;
  body: string;
};

const BAND_RANK: Record<RiskBand, number> = {
  fewer: 0,
  some: 1,
  more: 2,
};

export function getTrendGuidance(bands: RiskBand[]): TrendGuidance {
  if (bands.length === 0) {
    return {
      level: "watch",
      title: "Complete a screening before interpreting a trend.",
      body: "SoundCue needs at least one comparable Parkinson’s voice screening result before it can suggest a next step.",
    };
  }

  const recent = bands.slice(-3);
  const latest = recent.at(-1) as RiskBand;
  const prior = recent.slice(0, -1);
  const hasEarlierElevatedCategory = prior.some((band) => band !== "fewer");
  const movedUp = prior.some((band) => BAND_RANK[latest] > BAND_RANK[band]);

  if (latest === "more") {
    return {
      level: "speak",
      title: "Speak with a clinician about this result.",
      body: "Your latest comparable screening found more of the voice patterns SoundCue checks for. Arrange a conversation, especially if you or someone close to you has noticed changes in your voice, movement, balance, stiffness, or tremor.",
    };
  }

  if (latest === "some" || movedUp || hasEarlierElevatedCategory) {
    return {
      level: "consider",
      title: "Consider speaking with a clinician.",
      body: "Your latest result or the change across recent results may be worth discussing. A clinician can review your voice, symptoms, medications, and medical history together.",
    };
  }

  return {
    level: "watch",
    title: "This trend does not call for a clinician visit on its own.",
    body: "Your comparable results remain in the fewer-patterns category. Still speak with a clinician if you notice a lasting voice change or symptoms such as tremor, stiffness, slowed movement, or balance changes—regardless of this screening.",
  };
}
