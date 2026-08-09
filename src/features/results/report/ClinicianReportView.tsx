import Link from "next/link";
import { ArrowLeft, Download, FileHeart, ShieldCheck } from "lucide-react";
import type { ClinicianReportModel } from "./report-model";
import { ClinicianReportShareButton } from "./ClinicianReportShareButton";
import { PrintReportButton } from "./PrintReportButton";
import styles from "./clinician-report.module.css";

const BAND_LABELS = ["Fewer patterns", "Some patterns", "More patterns"] as const;

function ReportSpectrum({ model }: { model: ClinicianReportModel }) {
  return (
    <figure className={styles.spectrumFigure}>
      <figcaption className="sr-only">
        This screening result is {model.bandLabel}, on a spectrum from fewer to more detected patterns.
      </figcaption>
      <div className={styles.spectrum} aria-hidden="true">
        <span className={styles.spectrumMarker} style={{ left: `${model.spectrumPosition}%` }}>
          <i />
          <b>Your result</b>
        </span>
      </div>
      <div className={styles.spectrumLabels} aria-hidden="true">
        {BAND_LABELS.map((label) => <span key={label}>{label}</span>)}
      </div>
    </figure>
  );
}

function HistorySummary({ model }: { model: ClinicianReportModel }) {
  if (model.history.length <= 1) {
    return (
      <div className={styles.singleSession}>
        <strong>One comparable session</strong>
        <p>A trend needs at least two screenings analyzed with the same research-model policy.</p>
      </div>
    );
  }

  return (
    <div className={styles.historyBlock}>
      <svg
        className={styles.historyChart}
        viewBox="0 0 680 180"
        role="img"
        aria-labelledby="report-history-title report-history-description"
      >
        <title id="report-history-title">Comparable screening history</title>
        <desc id="report-history-description">
          {model.history.map((point) => `${point.label}: ${point.band} detected patterns`).join(". ")}
        </desc>
        <line x1="40" y1="36" x2="640" y2="36" />
        <line x1="40" y1="90" x2="640" y2="90" />
        <line x1="40" y1="144" x2="640" y2="144" />
        <polyline
          points={model.history.map((point, index) => {
            const x = model.history.length === 1
              ? 340
              : 40 + (index * 600) / (model.history.length - 1);
            const y = point.band === "fewer" ? 144 : point.band === "some" ? 90 : 36;
            return `${x},${y}`;
          }).join(" ")}
        />
        {model.history.map((point, index) => {
          const x = model.history.length === 1
            ? 340
            : 40 + (index * 600) / (model.history.length - 1);
          const y = point.band === "fewer" ? 144 : point.band === "some" ? 90 : 36;
          return <circle cx={x} cy={y} r="7" key={point.id} />;
        })}
      </svg>
      <ol className={styles.historyList} aria-label="Comparable sessions">
        {model.history.map((point) => (
          <li key={point.id}>
            <time dateTime={point.date}>{point.label}</time>
            <strong>{point.band[0].toUpperCase() + point.band.slice(1)} detected patterns</strong>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ClinicianReportView({ model }: { model: ClinicianReportModel }) {
  const isTrendReport = model.reportKind === "trend";
  const pdfUrl = isTrendReport
    ? "/api/reports/clinician-trends/pdf"
    : `/api/screenings/${model.screeningId}/pdf`;

  return (
    <article className={`${styles.report} page-container`}>
      <nav className={styles.reportNav} aria-label="Report actions">
        <Link className={styles.backLink} href={isTrendReport ? "/history" : `/screenings/${model.screeningId}`}>
          <ArrowLeft aria-hidden="true" size={20} /> {isTrendReport ? "Back to history" : "Back to result"}
        </Link>
        <div className={styles.reportActions}>
          <PrintReportButton />
          <ClinicianReportShareButton pdfUrl={pdfUrl} />
          <a className="button button--primary" href={pdfUrl}>
            <Download aria-hidden="true" size={20} /> {isTrendReport ? "Download trend PDF" : "Download PDF"}
          </a>
        </div>
      </nav>

      <header className={styles.reportHeader}>
        <div>
          <p className={styles.brand}>SoundCue</p>
          <h1>{isTrendReport ? "Parkinson’s voice screening trend report" : "Parkinson’s voice screening clinician summary"}</h1>
          <p className={styles.reportPurpose}>
            {isTrendReport
              ? `A patient-generated report of ${model.sessionCount} comparable ${model.sessionCount === 1 ? "screening" : "screenings"} to support a conversation with a healthcare professional.`
              : "A patient-generated screening summary to support a conversation with a healthcare professional."}
          </p>
        </div>
        <dl className={styles.reportMeta}>
          <div><dt>Report ID</dt><dd>{model.reportId}</dd></div>
          <div><dt>{isTrendReport ? "Latest recording" : "Recorded"}</dt><dd>{model.recordedAt}</dd></div>
          {isTrendReport ? <div><dt>Comparable sessions</dt><dd>{model.sessionCount}</dd></div> : null}
          <div><dt>Model</dt><dd>{model.modelVersion}</dd></div>
        </dl>
      </header>

      <section className={styles.resultSnapshot} aria-labelledby="report-result-title">
        <div className={styles.resultLead}>
          <span className={styles.resultGlyph} aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <div>
            <p>{isTrendReport ? "Latest comparable result" : "Screening result"}</p>
            <h2 id="report-result-title">{model.bandLabel}</h2>
          </div>
        </div>
        <p className={styles.resultSummary}>{model.bandSummary}</p>
        <ReportSpectrum model={model} />
        <div className={styles.nextStep}>
          <FileHeart aria-hidden="true" size={28} strokeWidth={1.5} />
          <div>
            <h3>{model.recommendationTitle}</h3>
            <p>{model.recommendation}</p>
          </div>
        </div>
      </section>

      <section className={styles.reportSection} aria-labelledby="recording-observations-title">
        <div className={styles.sectionHeading}>
          <div>
            <p>Recording context</p>
            <h2 id="recording-observations-title">What SoundCue noticed</h2>
          </div>
          <dl className={styles.compactFacts}>
            <div><dt>Age entered</dt><dd>{model.ageYears ?? "Not collected"}</dd></div>
            <div><dt>Duration</dt><dd>{model.duration}</dd></div>
            <div><dt>Analysis completed</dt><dd>{model.completedAt}</dd></div>
          </dl>
        </div>
        <div className={styles.observationList}>
          {model.observations.map((observation) => (
            <div className={styles.observation} key={`${observation.code}-${observation.title}`}>
              <span className={styles.observationMark} aria-hidden="true" />
              <div>
                <div className={styles.observationHeading}>
                  <h3>{observation.title}</h3>
                  <strong>{observation.value}</strong>
                </div>
                <p>{observation.description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.historySection}>
          <h3>Comparable Parkinson’s voice screening history</h3>
          <p>Only research sessions using the same category policy are shown together. Categories are screening ranges, not probabilities of Parkinson’s disease.</p>
          <HistorySummary model={model} />
        </div>
      </section>

      <section className={styles.reportSection} aria-labelledby="clinical-review-title">
        <div className={styles.sectionHeading}>
          <div>
            <p>Clinical review</p>
            <h2 id="clinical-review-title">How to read this summary</h2>
          </div>
        </div>
        <div className={styles.reviewGrid}>
          <div>
            <h3>How the analysis works</h3>
            <p>{model.howItWorks}</p>
          </div>
          <div>
            <h3>Important limitations</h3>
            <p>{model.evidenceLimitations}</p>
            {model.evidence.limitations.length ? (
              <ul className={styles.evidenceLimitations}>
                {model.evidence.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
              </ul>
            ) : null}
          </div>
        </div>

        <div className={styles.evidence}>
          <h3>Preliminary internal development evidence</h3>
          {model.evidence.participants ? <p>Development cohort: {model.evidence.participants} participants.</p> : null}
          {model.evidence.metrics.length ? (
            <dl className={styles.evidenceGrid}>
              {model.evidence.metrics.map((metric) => (
                <div key={metric.label}>
                  <dt>{metric.label}</dt>
                  <dd>{metric.value}</dd>
                  {metric.detail ? <p>{metric.detail}</p> : null}
                </div>
              ))}
            </dl>
          ) : (
            <p className={styles.unavailableEvidence}>Version-matched development metrics are not available in this report.</p>
          )}
          <p>These figures describe internal model development, not performance in independent clinical use.</p>
        </div>

        <div className={styles.questions}>
          <h3>Questions to consider with a clinician</h3>
          <ul>{model.clinicianQuestions.map((question) => <li key={question}>{question}</li>)}</ul>
        </div>

        <dl className={styles.technicalMeta}>
          <div><dt>Preprocessing</dt><dd>{model.preprocessingVersion}</dd></div>
          <div><dt>Category policy</dt><dd>{model.bandPolicyVersion}</dd></div>
          <div><dt>Artifact SHA-256</dt><dd>{model.artifactHash}</dd></div>
          <div><dt>Report generated</dt><dd>{model.generatedAt}</dd></div>
        </dl>
      </section>

      <aside className={styles.finalNote} aria-label="Important screening limitation">
        <ShieldCheck aria-hidden="true" size={26} />
        <div>
          <strong>{model.disclaimer}</strong>
          <p>{model.hasRecording ? "The latest recording remains in the user’s authenticated SoundCue account." : "No recording is available for the latest session."}</p>
        </div>
      </aside>
    </article>
  );
}
