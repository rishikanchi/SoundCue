"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AudioLines, Headphones, Plus, Trash2 } from "lucide-react";
import { RISK_BAND_COPY } from "@/lib/result-copy";
import type { RiskBand, ScreeningView } from "@/types/screening";
import styles from "./history.module.css";

export type HistorySession = { view: ScreeningView; spectrumPosition: number };

type HistoryViewProps = { sessions: HistorySession[]; sample?: boolean };

const BAND_POSITION: Record<RiskBand, number> = { fewer: 0.18, some: 0.55, more: 0.84 };

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function HistoryView({ sessions: initialSessions, sample = false }: HistoryViewProps) {
  const [sessions, setSessions] = useState(initialSessions);
  const [status, setStatus] = useState<string | null>(null);
  const chronological = useMemo(() => [...sessions].sort((a,b) => a.view.created_at.localeCompare(b.view.created_at)), [sessions]);
  const listed = [...sessions].sort((a,b) => b.view.created_at.localeCompare(a.view.created_at));

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
          <h1>Your screening history.</h1>
          <p>A record of your past voice screenings, so you can notice changes and share context with your care team.</p>
        </div>
        <Link className="button button--primary" href="/screenings/new"><Plus aria-hidden="true" size={20} /> Start a new screening</Link>
      </header>

      {sample ? (
        <div className={styles.sampleNote} role="note"><strong>Sample history</strong> These five synthetic sessions show how the history view works. They do not contain a person&apos;s voice.</div>
      ) : null}

      {sessions.length === 0 ? (
        <section className={styles.empty}>
          <div className={styles.emptyWave} aria-hidden="true">╱╲╱╲╱╲</div>
          <h2>Your history will appear here.</h2>
          <p>After your first completed screening, you can return to see its category and clinician summary.</p>
          <Link className="button button--primary" href="/screenings/new">Start your first screening</Link>
        </section>
      ) : (
        <>
          <section className={styles.chartSection} aria-labelledby="trend-title">
            <div className={styles.chartMain}>
              <div className={styles.chartHeading}>
                <div><h2 id="trend-title">Detected voice patterns over time</h2><p>Each point represents one screening result.</p></div>
              </div>
              <TrendChart sessions={chronological} />
            </div>
            <aside className={styles.insight}>
              <span aria-hidden="true"><AudioLines size={38} strokeWidth={1.45} /></span>
              <h3>Your recent results have shown some variation.</h3>
              <p>A trend alone cannot diagnose a condition.</p>
            </aside>
          </section>

          <section className={styles.sessions} aria-labelledby="sessions-title">
            <div className={styles.sessionsHeading}><h2 id="sessions-title">Screening history</h2><span>{sessions.length} {sessions.length === 1 ? "session" : "sessions"}</span></div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Date</th><th>Result</th><th>Recording</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {listed.map(({ view }) => {
                    const band = view.band ?? "some";
                    return (
                      <tr key={view.id}>
                        <td><strong>{shortDate(view.completed_at ?? view.created_at)}</strong>{view.is_synthetic ? <small>Synthetic sample</small> : null}</td>
                        <td><span className={styles.band} data-band={band}><i aria-hidden="true" />{RISK_BAND_COPY[band].label}</span></td>
                        <td>{view.hasRecording && !sample ? <a className={styles.audioLink} href={`/api/screenings/${view.id}/audio`}><Headphones aria-hidden="true" size={18} /> Listen</a> : <span className={styles.unavailable}>Not available</span>}</td>
                        <td><div className={styles.rowActions}>{sample ? null : <Link className={styles.viewLink} href={`/screenings/${view.id}`}>View result</Link>}{sample ? null : <button type="button" aria-label={`Delete screening from ${shortDate(view.created_at)}`} onClick={() => void remove(view.id)}><Trash2 aria-hidden="true" size={18} /></button>}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {status ? <p className={styles.status} role="status">{status}</p> : null}
    </div>
  );
}

function TrendChart({ sessions }: { sessions: HistorySession[] }) {
  const width = 1000;
  const height = 330;
  const marginX = 70;
  const x = (index: number) => sessions.length === 1 ? width / 2 : marginX + index * ((width - marginX * 2) / (sessions.length - 1));
  const y = (item: HistorySession) => 40 + (1 - (item.spectrumPosition ?? BAND_POSITION[item.view.band ?? "some"])) * 220;
  const path = sessions.map((item,index) => `${index ? "L" : "M"} ${x(index)} ${y(item)}`).join(" ");
  const description = sessions.map(({view},index) => `${index + 1}: ${shortDate(view.created_at)}, ${RISK_BAND_COPY[view.band ?? "some"].label}`).join("; ");

  return (
    <div className={styles.chart}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="trend-chart-title trend-chart-desc">
        <title id="trend-chart-title">Screening categories over time</title>
        <desc id="trend-chart-desc">{description}</desc>
        <rect x="70" y="34" width="860" height="78" rx="8" className={styles.zoneMore} />
        <rect x="70" y="112" width="860" height="78" className={styles.zoneSome} />
        <rect x="70" y="190" width="860" height="78" rx="8" className={styles.zoneFewer} />
        <text x="82" y="78">More</text><text x="82" y="156">Some</text><text x="82" y="234">Fewer</text>
        <path d={path} className={styles.line} />
        {sessions.map((item,index) => <g key={item.view.id}><circle cx={x(index)} cy={y(item)} r="9" className={styles.point} /><text x={x(index)} y="304" textAnchor="middle" className={styles.dateLabel}>{shortDate(item.view.created_at).replace(", 2026","")}</text></g>)}
      </svg>
      <ol className="sr-only">{sessions.map(({view}) => <li key={view.id}>{shortDate(view.created_at)}: {RISK_BAND_COPY[view.band ?? "some"].label}</li>)}</ol>
    </div>
  );
}
