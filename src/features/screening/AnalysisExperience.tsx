"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ShieldPlus } from "lucide-react";
import type { AcousticFeatures, RiskBand, ScreeningView } from "@/types/screening";
import styles from "./analysis-experience.module.css";

type AnalysisExperienceProps = {
  screeningId: string;
  preview?: boolean;
};

type Stage = "quality" | "steadiness" | "patterns" | "complete" | "error";

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function previewScreening(features: AcousticFeatures): ScreeningView {
  const score = Math.max(
    0.08,
    Math.min(
      0.92,
      0.18 +
        features.jitter * 8 +
        features.shimmer * 1.3 +
        features.pitchVariation * 0.9 +
        (1 - features.breathSupport) * 0.16,
    ),
  );
  const band: RiskBand = score < 0.36 ? "fewer" : score < 0.68 ? "some" : "more";
  const level = (value: number) => (value < 0.33 ? "lower" : value < 0.67 ? "moderate" : "higher");
  const now = new Date().toISOString();
  return {
    id: "preview",
    status: "completed",
    recording_mime_type: "audio/webm",
    recording_size_bytes: null,
    duration_seconds: features.durationSeconds,
    feature_version: features.version,
    quality: { passed: true, reasons: [] },
    analyzer_kind: "dummy",
    analyzer_version: "dummy-signal-v1",
    band,
    findings: [
      { code: "voice_steadiness", level: level(features.jitter * 18) },
      { code: "pitch_variation", level: level(features.pitchVariation * 1.5) },
      { code: "breath_support", level: level(1 - features.breathSupport) },
    ],
    failure_code: null,
    is_synthetic: false,
    created_at: now,
    updated_at: now,
    completed_at: now,
    hasRecording: false,
  };
}

export function AnalysisExperience({ screeningId, preview = false }: AnalysisExperienceProps) {
  const router = useRouter();
  const started = useRef(false);
  const [stage, setStage] = useState<Stage>("quality");
  const [waveform, setWaveform] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const storageKey = preview
      ? "soundcue-preview-recording"
      : `soundcue-waveform-${screeningId}`;
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      requestAnimationFrame(() => {
        try {
          const parsed = JSON.parse(raw) as { waveformSamples?: number[] } | number[];
          setWaveform(Array.isArray(parsed) ? parsed : parsed.waveformSamples ?? []);
        } catch {
          setWaveform([]);
        }
      });
    }

    async function analyze() {
      try {
        await wait(560);
        setStage("steadiness");
        await wait(760);
        setStage("patterns");

        let screening: ScreeningView;
        if (preview) {
          const recording = JSON.parse(
            sessionStorage.getItem("soundcue-preview-recording") ?? "{}",
          ) as { features?: AcousticFeatures };
          if (!recording.features) throw new Error("missing_preview");
          await wait(650);
          screening = previewScreening(recording.features);
          sessionStorage.setItem("soundcue-preview-result", JSON.stringify(screening));
        } else {
          const response = await fetch(`/api/screenings/${screeningId}/analyze`, {
            method: "POST",
          });
          if (!response.ok) throw new Error("analysis_failed");
          ({ screening } = (await response.json()) as { screening: ScreeningView });
        }

        setStage("complete");
        await wait(420);
        if (screening.status === "needs_rerecord") {
          router.replace("/screenings/new?quality=retry");
        } else {
          router.replace(`/screenings/${screening.id}${preview ? "?preview=1" : ""}`);
        }
      } catch {
        setMessage("Analysis is temporarily unavailable. Your recording is safe; please try again.");
        setStage("error");
      }
    }

    void analyze();
  }, [preview, router, screeningId]);

  async function cancel() {
    if (!preview) {
      await fetch(`/api/screenings/${screeningId}`, { method: "DELETE" }).catch(() => null);
    }
    router.push("/screenings/new");
  }

  return (
    <div className={styles.experience}>
      <header>
        <h1>Looking at your voice patterns.</h1>
        <p>This usually takes a few moments.</p>
      </header>
      <div className={styles.transformation}>
        <SignalSource samples={waveform} />
        <div className={styles.arrow} aria-hidden="true">→</div>
        <ol className={styles.stages} aria-label="Analysis progress">
          <StageRow
            active={stage === "quality"}
            complete={stage !== "quality" && stage !== "error"}
            label="Checking recording quality"
          />
          <StageRow
            active={stage === "steadiness"}
            complete={["patterns", "complete"].includes(stage)}
            label="Measuring voice steadiness"
            variant="steady"
          />
          <StageRow
            active={stage === "patterns"}
            complete={stage === "complete"}
            label="Reviewing pitch and breath patterns"
            variant="dotted"
          />
        </ol>
      </div>
      <div className={styles.keepOpen}>
        <ShieldPlus aria-hidden="true" size={34} strokeWidth={1.45} />
        <strong>{stage === "complete" ? "Your result is ready." : "Keep this window open."}</strong>
        <p>Your result will appear here automatically.</p>
      </div>
      {message ? (
        <div className={styles.error} role="alert">
          <p>{message}</p>
          <button className="button button--secondary" onClick={() => location.reload()} type="button">
            Try again
          </button>
        </div>
      ) : null}
      <button className={styles.cancel} onClick={() => void cancel()} type="button">
        Cancel analysis
      </button>
      <span className="sr-only" aria-live="polite">
        {stage === "quality" ? "Checking recording quality." : null}
        {stage === "steadiness" ? "Measuring voice steadiness." : null}
        {stage === "patterns" ? "Reviewing pitch and breath patterns." : null}
        {stage === "complete" ? "Analysis complete. Opening your result." : null}
      </span>
    </div>
  );
}

function SignalSource({ samples }: { samples: number[] }) {
  const safe = samples.length ? samples.slice(0, 32) : Array.from({ length: 32 }, (_, index) => Math.sin(index * 0.9) * 0.55);
  return (
    <svg className={styles.source} viewBox="0 0 360 210" aria-label="A visual trace of your recording" role="img">
      {safe.map((sample, index) => {
        const height = 10 + Math.abs(sample) * 132;
        const x = 10 + index * (340 / Math.max(1, safe.length - 1));
        return (
          <line key={index} x1={x} x2={x} y1={105 - height / 2} y2={105 + height / 2} />
        );
      })}
    </svg>
  );
}

function StageRow({
  label,
  active,
  complete,
  variant = "natural",
}: {
  label: string;
  active: boolean;
  complete: boolean;
  variant?: "natural" | "steady" | "dotted";
}) {
  return (
    <li className={styles.stage} data-active={active || undefined} data-complete={complete || undefined}>
      <span className={styles.stageIcon} aria-hidden="true">
        {complete ? <Check size={20} strokeWidth={2} /> : <i />}
      </span>
      <span className={`${styles.trace} ${styles[`trace_${variant}`]}`} aria-hidden="true" />
      <span className={styles.stageLabel}>
        <strong>{label}</strong>
        <small>{complete ? "Complete" : active ? "In progress" : "Waiting"}</small>
      </span>
    </li>
  );
}
