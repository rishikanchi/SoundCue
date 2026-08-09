"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AudioLines, Download, FileText, Headphones, Plus, Trash2 } from "lucide-react";
import { ClinicianReportShareButton } from "@/features/results/report/ClinicianReportShareButton";
import { RISK_BAND_COPY } from "@/lib/result-copy";
import { getTrendGuidance } from "@/lib/trend-guidance";
import type { RiskBand, ScreeningView } from "@/types/screening";
import styles from "./history.module.css";

export type HistorySession = { view: ScreeningView; spectrumPosition: number };

type HistoryViewProps = { sessions: HistorySession[]; sample?: boolean };

const BAND_POSITION: Record<RiskBand, number> = { fewer: 0.18, some: 0.55, more: 0.84 };

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function newestFirst(sessions: HistorySession[]) {
  return [...sessions].sort((a, b) => b.view.created_at.localeCompare(a.view.created_at));
}

export function HistoryView({ sessions: initialSessions, sample = false }: HistoryViewProps) {
  const [sessions, setSessions] = useState(initialSessions);
  const [status, setStatus] = useState<string | null>(null);
  const researchSessions = useMemo(
    () => sessions.filter(({ view }) => view.analyzer_kind === "research"),
    [sessions],
  );
  const earlierDemoSessions = useMemo(
    () => sessions.filter(({ view }) => view.analyzer_kind === "dummy"),
    [sessions],
  );
  const currentPolicy = newestFirst(researchSessions)[0]?.view.band_policy_version ?? null;
  const comparableSessions = useMemo(
    () => researchSessions
      .filter(({ view }) => view.band_policy_version === currentPolicy)
      .sort((a, b) => a.view.created_at.localeCompare(b.view.created_at)),
    [currentPolicy, researchSessions],
  );
  const earlierPolicySessions = useMemo(
    () => researchSessions.filter(({ view }) => view.band_policy_version !== currentPolicy),
    [currentPolicy, researchSessions],
  );
  const trendGuidance = useMemo(
    () => getTrendGuidance(comparableSessions.map(({ view }) => view.band ?? "some")),
    [comparableSessions],
  );

  async function remove(screeningId: string) {
    if (!confirm("Delete this screening and its recording permanently? This cannot be undone.")) return;
    setStatus("Deleting screening…");
    const response = await fetch(`/api/screenings/${screeningId}`, { method: "DELETE" });
    if (!response.ok) {
      setStatus("We could not delete that screening. Please try again.");
      return;
    }
    setSessions((current) => current.filter(({ view }) => view.id !== screeningId));
    setStatus("Screening deleted.");
  }

  return (
    <div className={`${styles.history} page-container`}>
      <header className={styles.heading}>
        <div>
          <h1>Your Parkinson’s voice screening history.</h1>
          <p>Review comparable results over time, understand when to speak with a clinician, and share the full trend with your care team.</p>
        </div>
        <Link className="button button--primary" href="/screenings/new"><Plus aria-hidden="true" size={20} /> Start a new screening</Link>
      </header>

      {sample ? (
        <div className={styles.sampleNote} role="note"><strong>Sample history</strong> These five synthetic sessions demonstrate Parkinson’s voice screening trends. They do not contain a person&apos;s voice.</div>
      ) : null}

      {researchSessions.length === 0 ? (
        <section className={styles.empty}>
          <div className={styles.emptyWave} aria-hidden="true">╱╲╱╲╱╲</div>
          <h2>Your Parkinson’s voice screening history will appear here.</h2>
          <p>After your first completed research-model screening, you can return to see its category and prepare a clinician report.</p>
          <Link className="button button--primary" href="/screenings/new">Start your first screening</Link>
        </section>
      ) : (
        <>
          <section className={styles.chartSection} aria-labelledby="trend-title">
            <div className={styles.chartMain}>
              <div className={styles.chartHeading}>
                <div>
                  <h2 id="trend-title">Detected voice patterns over time</h2>
                  <p>Only Parkinson’s voice screening sessions using the current category policy are connected.</p>
                </div>
              </div>
              <TrendChart sessions={comparableSessions} />
            </div>
            <aside className={styles.insight} data-level={trendGuidance.level}>
              <span aria-hidden="true"><AudioLines size={38} strokeWidth={1.45} /></span>
              <h3>{trendGuidance.title}</h3>
              <p>{trendGuidance.body}</p>
              {!sample ? (
                <div className={styles.reportActions}>
                  <a className="button button--primary" href="/api/reports/clinician-trends/pdf">
                    <Download aria-hidden="true" size={19} /> Download clinician trend report
                  </a>
                  <ClinicianReportShareButton pdfUrl="/api/reports/clinician-trends/pdf" />
                  <Link className={styles.accessibleReportLink} href="/history/clinician-report">
                    <FileText aria-hidden="true" size={18} /> View accessible report
                  </Link>
                </div>
              ) : null}
              <p className={styles.trendDisclaimer}>SoundCue cannot diagnose or rule out Parkinson’s disease.</p>
            </aside>
          </section>

          <SessionSection
            id="sessions-title"
            title="Parkinson’s voice screening history"
            sessions={researchSessions}
            sample={sample}
            onRemove={remove}
          />

          {earlierPolicySessions.length ? (
            <p className={styles.policyNote} role="note">
              {earlierPolicySessions.length} earlier research {earlierPolicySessions.length === 1 ? "session uses" : "sessions use"} a different category policy. They remain in the list but are not connected to the current trend.
            </p>
          ) : null}
        </>
      )}

      {earlierDemoSessions.length ? (
        <details className={styles.earlierDemo} open={sample || undefined}>
          <summary>
            <span>Earlier demo sessions</span>
            <small>{earlierDemoSessions.length} {earlierDemoSessions.length === 1 ? "session" : "sessions"}</small>
          </summary>
          <p>These sessions used development software. They are not included in Parkinson’s research-model trends or clinician reports.</p>
          <SessionTable sessions={earlierDemoSessions} sample={sample} onRemove={remove} reportsEnabled={false} />
        </details>
      ) : null}

      {status ? <p className={styles.status} role="status">{status}</p> : null}
    </div>
  );
}

function SessionSection({
  id,
  title,
  sessions,
  sample,
  onRemove,
}: {
  id: string;
  title: string;
  sessions: HistorySession[];
  sample: boolean;
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <section className={styles.sessions} aria-labelledby={id}>
      <div className={styles.sessionsHeading}>
        <h2 id={id}>{title}</h2>
        <span>{sessions.length} {sessions.length === 1 ? "session" : "sessions"}</span>
      </div>
      <SessionTable sessions={sessions} sample={sample} onRemove={onRemove} reportsEnabled />
    </section>
  );
}

function SessionTable({
  sessions,
  sample,
  onRemove,
  reportsEnabled,
}: {
  sessions: HistorySession[];
  sample: boolean;
  onRemove: (id: string) => Promise<void>;
  reportsEnabled: boolean;
}) {
  return (
    <div className={styles.tableWrap}>
      <table>
        <thead><tr><th>Date</th><th>Result</th><th>Recording</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {newestFirst(sessions).map(({ view }) => {
            const band = view.band ?? "some";
            return (
              <tr key={view.id}>
                <td><strong>{shortDate(view.completed_at ?? view.created_at)}</strong>{view.is_synthetic ? <small>Synthetic sample</small> : null}</td>
                <td><span className={styles.band} data-band={band}><i aria-hidden="true" />{RISK_BAND_COPY[band].label}</span></td>
                <td>{view.hasRecording && !sample ? <a className={styles.audioLink} href={`/api/screenings/${view.id}/audio`}><Headphones aria-hidden="true" size={18} /> Listen</a> : <span className={styles.unavailable}>Not available</span>}</td>
                <td>
                  <div className={styles.rowActions}>
                    {!sample && reportsEnabled ? <Link className={styles.viewLink} href={`/screenings/${view.id}`}>View result</Link> : null}
                    {!sample ? <button type="button" aria-label={`Delete screening from ${shortDate(view.created_at)}`} onClick={() => void onRemove(view.id)}><Trash2 aria-hidden="true" size={18} /></button> : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TrendChart({ sessions }: { sessions: HistorySession[] }) {
  if (sessions.length === 0) return <p className={styles.singleTrend}>No sessions use the current category policy yet.</p>;
  const width = 1000;
  const height = 330;
  const marginX = 70;
  const x = (index: number) => sessions.length === 1 ? width / 2 : marginX + index * ((width - marginX * 2) / (sessions.length - 1));
  const y = (item: HistorySession) => 40 + (1 - BAND_POSITION[item.view.band ?? "some"]) * 220;
  const path = sessions.map((item,index) => `${index ? "L" : "M"} ${x(index)} ${y(item)}`).join(" ");
  const description = sessions.map(({view},index) => `${index + 1}: ${shortDate(view.created_at)}, ${RISK_BAND_COPY[view.band ?? "some"].label}`).join("; ");

  return (
    <div className={styles.chart}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="trend-chart-title trend-chart-desc">
        <title id="trend-chart-title">Comparable Parkinson’s voice screening categories over time</title>
        <desc id="trend-chart-desc">{description}</desc>
        <rect x="70" y="34" width="860" height="78" rx="8" className={styles.zoneMore} />
        <rect x="70" y="112" width="860" height="78" className={styles.zoneSome} />
        <rect x="70" y="190" width="860" height="78" rx="8" className={styles.zoneFewer} />
        <text x="82" y="78">More</text><text x="82" y="156">Some</text><text x="82" y="234">Fewer</text>
        {sessions.length > 1 ? <path d={path} className={styles.line} /> : null}
        {sessions.map((item,index) => <g key={item.view.id}><circle cx={x(index)} cy={y(item)} r="9" className={styles.point} /><text x={x(index)} y="304" textAnchor="middle" className={styles.dateLabel}>{shortDate(item.view.created_at).replace(`, ${new Date(item.view.created_at).getFullYear()}`, "")}</text></g>)}
      </svg>
      <ol className="sr-only">{sessions.map(({view}) => <li key={view.id}>{shortDate(view.created_at)}: {RISK_BAND_COPY[view.band ?? "some"].label}</li>)}</ol>
    </div>
  );
}
