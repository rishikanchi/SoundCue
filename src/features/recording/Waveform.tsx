"use client";

import { useMemo } from "react";
import styles from "./VoiceRecorder.module.css";

interface WaveformProps {
  samples: readonly number[];
  active?: boolean;
  label: string;
}

const DISPLAY_POINTS = 72;

export function Waveform({ samples, active = false, label }: WaveformProps) {
  const bars = useMemo(() => {
    if (samples.length === 0) return Array.from({ length: DISPLAY_POINTS }, () => 0.035);
    return Array.from({ length: DISPLAY_POINTS }, (_, index) => {
      const start = Math.floor((index / DISPLAY_POINTS) * samples.length);
      const end = Math.max(start + 1, Math.floor(((index + 1) / DISPLAY_POINTS) * samples.length));
      let peak = 0;
      for (let sourceIndex = start; sourceIndex < Math.min(samples.length, end); sourceIndex += 1) {
        peak = Math.max(peak, Math.abs(samples[sourceIndex] ?? 0));
      }
      return Math.max(0.035, Math.min(1, peak));
    });
  }, [samples]);

  return (
    <div className={styles.waveformFrame} data-active={active || undefined}>
      <svg
        className={styles.waveform}
        viewBox="0 0 720 152"
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
      >
        <line className={styles.waveformBaseline} x1="0" x2="720" y1="76" y2="76" />
        {bars.map((amplitude, index) => {
          const height = Math.max(4, amplitude * 116);
          return (
            <rect
              className={styles.waveformBar}
              // The waveform position is stable and has no domain identity.
              key={index}
              x={index * 10 + 2.5}
              y={76 - height / 2}
              width="5"
              height={height}
              rx="2.5"
            />
          );
        })}
      </svg>
    </div>
  );
}
