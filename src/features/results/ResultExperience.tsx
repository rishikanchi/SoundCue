"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Download,
  FileHeart,
  FileText,
  Headphones,
  ShieldCheck,
} from "lucide-react";
import { AcousticVisual } from "@/components/brand/acoustic-visual";
import {
  RESEARCH_ANALYSIS_COPY,
  getFindingCopy,
  getResearchResultObservations,
  RISK_BAND_COPY,
  SCREENING_DISCLAIMER,
  type ResearchObservation,
} from "@/lib/result-copy";
import type { RiskBand, ScreeningView } from "@/types/screening";
import styles from "./result.module.css";

type ResultExperienceProps = {
  initialScreening?: ScreeningView | null;
  preview?: boolean;
};

const BAND_POSITION: Record<RiskBand, number> = { fewer: 18, some: 55, more: 84 };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ResultExperience({ initialScreening, preview = false }: ResultExperienceProps) {
  const [screening, setScreening] = useState(initialScreening ?? null);

  useEffect(() => {
    if (!preview || screening) return;
    const frame = requestAnimationFrame(() => {
      const raw = sessionStorage.getItem("soundcue-preview-result");
      if (!raw) return;
      try {
        setScreening(JSON.parse(raw) as ScreeningView);
      } catch {
        setScreening(null);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [preview, screening]);

  if (!screening?.band || screening.status !== "completed") {
    return (
      <div className={`${styles.result} page-container`}>
        <div className={styles.unavailable}>
          <h1>Your result is not available yet.</h1>
          <p>Record a new voice sample to begin a screening.</p>
          <Link className="button button--primary" href="/screenings/new">Start a screening</Link>
        </div>
      </div>
    );
  }

  const copy = RISK_BAND_COPY[screening.band];
  const isResearch = String(screening.analyzer_kind) === "research";
  const researchFields = screening as ScreeningView & {
    age_years?: number | null;
    observations?: ResearchObservation[] | null;
  };
  const researchObservations = isResearch
    ? getResearchResultObservations(
        researchFields.observations,
        screening.quality,
        screening.duration_seconds,
      )
    : [];
  const findingHeadline =
    screening.band === "fewer"
      ? "Fewer vocal changes detected."
      : screening.band === "some"
        ? "Some vocal changes detected."
        : "More vocal changes detected.";
  const guidanceHeadline =
    screening.band === "more"
      ? "Speak with a clinician about this result."
      : screening.band === "some"
        ? "Consider speaking with a clinician."
        : "Speak with a clinician if you have symptoms or concerns.";

  return (
    <article className={`${styles.result} page-container`}>
      <header className={styles.heading}>
        <h1>Your Parkinson’s voice screening result.</h1>
        <p className={styles.date}><CalendarDays aria-hidden="true" size={20} /> {formatDate(screening.completed_at ?? screening.created_at)}</p>
      </header>

      <section className={styles.overview} aria-labelledby="result-title">
        <span className={styles.resultGlyph} aria-hidden="true"><i /><i /><i /><i /><i /></span>
        <div>
          <h2 id="result-title">{findingHeadline}</h2>
          <p>
            {copy.summary}{" "}
            {isResearch
              ? RESEARCH_ANALYSIS_COPY.referenceSummary
              : "This category comes from SoundCue’s earlier development analyzer."}{" "}
            This screening cannot diagnose or rule out Parkinson’s disease.
          </p>
        </div>
        <AcousticVisual className={styles.resultSignal} variant="compact" />
      </section>

      <section className={styles.spectrumSection} aria-labelledby="spectrum-title">
        <h2 className="sr-only" id="spectrum-title">{copy.label}</h2>
        <div className={styles.spectrumWrap}>
          <div
            className={styles.spectrum}
            role="img"
            aria-label={`Result: ${copy.label}, on a spectrum from fewer to more detected patterns.`}
          >
            <span className={styles.marker} style={{ left: `${BAND_POSITION[screening.band]}%` }} aria-hidden="true">
              <i />
              <b>Your result</b>
            </span>
          </div>
          <div className={styles.spectrumLabels} aria-hidden="true">
            <span>Fewer patterns</span><span>Some patterns</span><span>More patterns</span>
          </div>
        </div>
      </section>

      <div className={styles.detailsGrid}>
        <section className={styles.findings} aria-labelledby="findings-title">
          <h2 id="findings-title">What we noticed</h2>
          <div className={styles.findingList}>
            {isResearch
              ? researchObservations.map((observation) => (
                <div className={styles.finding} key={observation.code}>
                  <span className={styles.findingMark} aria-hidden="true" />
                  <div>
                    <div className={styles.findingHeading}>
                      <h3>{observation.title}</h3>
                      <span>{observation.value}</span>
                    </div>
                    <p>{observation.description}</p>
                  </div>
                </div>
              ))
              : (screening.findings ?? []).map((finding) => {
                  const findingCopy = getFindingCopy(finding.code, finding.level);
                  return (
                    <div className={styles.finding} key={finding.code}>
                      <span className={styles.findingMark} aria-hidden="true" />
                      <div>
                        <h3>{findingCopy.title}</h3>
                        <p>{findingCopy.description}</p>
                      </div>
                    </div>
                  );
                })}
          </div>
          {isResearch ? <p className={styles.contextNote}>{RESEARCH_ANALYSIS_COPY.contextNote}</p> : null}
        </section>

        <section className={styles.guidance} aria-labelledby="guidance-title">
          <div className={styles.guidanceIcon}><FileHeart aria-hidden="true" size={31} strokeWidth={1.5} /></div>
          <div>
            <h2 id="guidance-title">{guidanceHeadline}</h2>
            <p>{copy.recommendation}</p>
            <div className={styles.actions}>
              {preview ? (
                <span className="button button--secondary" aria-disabled="true" title="Sign in to download summaries">
                  <Download aria-hidden="true" size={20} /> Download summary
                </span>
              ) : isResearch ? (
                <>
                  <a className="button button--primary" href={`/api/screenings/${screening.id}/pdf`}>
                    <Download aria-hidden="true" size={20} /> Download clinician summary
                  </a>
                  <Link className="button button--secondary" href={`/screenings/${screening.id}/report`}>
                    <FileText aria-hidden="true" size={20} /> View accessible report
                  </Link>
                </>
              ) : null}
              <Link className="button button--secondary" href="/screenings/new">Record again</Link>
            </div>
            <p className={styles.disclaimer}><ShieldCheck aria-hidden="true" size={19} /> {SCREENING_DISCLAIMER}</p>
          </div>
        </section>
      </div>

      {isResearch ? (
        <section className={styles.analysisDetails} aria-labelledby="analysis-details-title">
          <div>
            <h2 id="analysis-details-title">How this Parkinson’s voice analysis works</h2>
            <p>{RESEARCH_ANALYSIS_COPY.howItWorks}</p>
          </div>
          <div>
            <h3>Development evidence</h3>
            <p>{RESEARCH_ANALYSIS_COPY.evidenceLimitations}</p>
            {typeof researchFields.age_years === "number" ? (
              <p className={styles.analysisMeta}>Age entered for this screening: <strong>{researchFields.age_years}</strong></p>
            ) : null}
          </div>
        </section>
      ) : null}

      {screening.hasRecording && !preview ? (
        <section className={styles.playback} aria-labelledby="playback-title">
          <Headphones aria-hidden="true" size={28} strokeWidth={1.5} />
          <div>
            <h2 id="playback-title">Your recording</h2>
            <p>Listen to the voice sample used for this screening.</p>
          </div>
          <audio controls preload="none" src={`/api/screenings/${screening.id}/audio`} aria-label="Play the recording used for this screening" />
        </section>
      ) : null}
    </article>
  );
}
