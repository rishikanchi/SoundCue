"use client";

import { useState } from "react";
import type { AcceptedRecording, RecordingError, RecordingPhase } from "../../lib/audio/types";
import { Waveform } from "./Waveform";
import { useSoundPreference } from "./useSoundPreference";
import { useVoiceRecorder } from "./useVoiceRecorder";
import styles from "./VoiceRecorder.module.css";

export interface VoiceRecorderProps {
  onAccept: (recording: AcceptedRecording) => void | Promise<void>;
  onPhaseChange?: (phase: RecordingPhase) => void;
  onError?: (error: RecordingError) => void;
  disabled?: boolean;
  className?: string;
  showIntro?: boolean;
}

function formatSeconds(seconds: number): string {
  return `0:${Math.max(0, Math.floor(seconds)).toString().padStart(2, "0")}`;
}

function phaseAnnouncement(phase: RecordingPhase, countdown: number | null): string {
  if (phase === "requesting_permission") return "Waiting for microphone permission.";
  if (phase === "countdown") return countdown ? `Recording begins in ${countdown}.` : "Recording begins shortly.";
  if (phase === "recording") return "Recording has started. Begin your sustained ahhh sound.";
  if (phase === "processing") return "Preparing your recording for review.";
  if (phase === "review") return "Your recording is ready to review.";
  if (phase === "error") return "The recording could not be completed.";
  return "Ready to record.";
}

export function VoiceRecorder({
  onAccept,
  onPhaseChange,
  onError,
  disabled = false,
  className,
  showIntro = true,
}: VoiceRecorderProps) {
  const [soundCuesEnabled, setSoundCuesEnabled] = useSoundPreference();
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [state, controls] = useVoiceRecorder({
    soundCuesEnabled,
    onPhaseChange,
    onError,
  });
  const isBusy = ["requesting_permission", "countdown", "recording", "processing"].includes(state.phase);
  const recordingProgress = Math.min(1, state.elapsedSeconds / state.maximumSeconds);
  const reviewIsAcceptable = state.review?.quality.acceptable === true;

  async function acceptRecording() {
    const recording = controls.getAcceptedRecording();
    if (!recording || isAccepting) return;
    setAcceptError(null);
    setIsAccepting(true);
    try {
      await onAccept(recording);
    } catch {
      setAcceptError("We could not save this recording. Your recording is still here, so you can try again.");
    } finally {
      setIsAccepting(false);
    }
  }

  return (
    <section className={`${styles.recorder} ${className ?? ""}`} aria-labelledby="recording-title">
      <div className={styles.headingRow}>
        {showIntro ? (
          <h1 className={styles.title} id="recording-title">Hold a steady “ahhh”</h1>
        ) : (
          <h2 className={styles.srOnly} id="recording-title">Voice recorder</h2>
        )}
        <label className={styles.soundToggle}>
          <input
            type="checkbox"
            checked={soundCuesEnabled}
            onChange={(event) => setSoundCuesEnabled(event.target.checked)}
          />
          <span>{soundCuesEnabled ? "Sound cues on" : "Sound cues off"}</span>
        </label>
      </div>

      {showIntro ? (
        <p className={styles.intro}>
          Take a comfortable breath, then hold one clear “ahhh” at your usual speaking volume.
          Aim for about 8 seconds. You can listen before choosing to continue.
        </p>
      ) : null}

      <div className={styles.statusCard} data-phase={state.phase}>
        <div className={styles.visualArea}>
          {state.phase === "countdown" ? (
            <div className={styles.countdown} aria-hidden="true">{state.countdown}</div>
          ) : (
            <Waveform
              samples={state.liveWaveform}
              active={state.phase === "recording"}
              label={state.phase === "recording"
                ? state.liveInputStatus === "low"
                  ? "Live waveform is nearly flat; the microphone is not hearing enough sound"
                  : "Live waveform showing that the microphone is receiving your voice"
                : "Waveform preview of your recording"}
            />
          )}
        </div>

        <div className={styles.statusLine}>
          <div>
            <strong>
              {state.phase === "idle" && "Ready when you are"}
              {state.phase === "requesting_permission" && "Allow microphone access"}
              {state.phase === "countdown" && "Take a comfortable breath"}
              {state.phase === "recording" && (state.liveInputStatus === "low"
                ? "We are not hearing enough sound"
                : state.canStop ? "You can stop when ready" : "Keep holding the sound")}
              {state.phase === "processing" && "Preparing your recording"}
              {state.phase === "review" && (reviewIsAcceptable ? "Listen before continuing" : "Please record once more")}
              {state.phase === "error" && "We could not start the recording"}
            </strong>
            <span className={styles.statusDetail}>
              {state.phase === "idle" && "Your browser will ask for microphone permission."}
              {state.phase === "requesting_permission" && "Choose Allow in your browser prompt."}
              {state.phase === "countdown" && "Recording will start after the countdown."}
              {state.phase === "recording" && (state.liveInputStatus === "low"
                ? "Move a little closer to the microphone and continue at a comfortable volume."
                : `${formatSeconds(state.elapsedSeconds)} of ${formatSeconds(state.maximumSeconds)} maximum`)}
              {state.phase === "processing" && "This usually takes only a moment."}
              {state.phase === "review" && state.review && `${state.review.durationSeconds.toFixed(1)} second recording`}
              {state.phase === "error" && state.error?.message}
            </span>
          </div>
          {state.phase === "recording" ? (
            <span className={styles.recordingIndicator} aria-hidden="true">Recording</span>
          ) : null}
        </div>

        {state.phase === "recording" ? (
          <div className={styles.progressTrack} aria-hidden="true">
            <div className={styles.progressFill} style={{ transform: `scaleX(${recordingProgress})` }} />
            <span className={styles.minimumMarker} title="Five-second minimum" />
            <span className={styles.targetMarker} title="Eight-second target" />
          </div>
        ) : null}

        {state.review ? (
          <div className={styles.review}>
            <audio className={styles.audio} controls preload="metadata" src={state.review.previewUrl} aria-label="Play back your voice recording">
              Your browser does not support audio playback.
            </audio>
            {state.quality && !state.quality.acceptable ? (
              <div className={styles.qualityNotice} role="alert">
                <strong>This recording needs another try.</strong>
                <ul>
                  {state.quality.issues.map((issue) => (
                    <li key={issue.code}>
                      {issue.message} {issue.guidance}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className={styles.qualityOkay}>
                The microphone received enough clear audio for the placeholder analysis.
              </p>
            )}
          </div>
        ) : null}

        {acceptError ? <p className={styles.saveError} role="alert">{acceptError}</p> : null}

        <div className={styles.actions}>
          {state.phase === "idle" || state.phase === "error" ? (
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => void controls.begin()}
              disabled={disabled}
            >
              Start recording
            </button>
          ) : null}
          {state.phase === "requesting_permission" || state.phase === "countdown" ? (
            <button className={styles.secondaryButton} type="button" onClick={controls.reset}>
              Cancel
            </button>
          ) : null}
          {state.phase === "recording" ? (
            <button
              className={styles.stopButton}
              type="button"
              onClick={controls.stop}
              disabled={!state.canStop}
              aria-describedby={!state.canStop ? "recording-minimum" : undefined}
            >
              Stop recording
            </button>
          ) : null}
          {state.phase === "review" ? (
            <>
              <button className={styles.secondaryButton} type="button" onClick={() => void controls.begin()} disabled={isAccepting}>
                Record again
              </button>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={() => void acceptRecording()}
                disabled={!reviewIsAcceptable || isAccepting}
              >
                {isAccepting ? "Saving recording…" : "Use this recording"}
              </button>
            </>
          ) : null}
        </div>

        <p className={styles.minimumNote} id="recording-minimum">
          Minimum 5 seconds · Target 8 seconds · Stops automatically at 12 seconds
        </p>
      </div>

      <p className={styles.privacyNote}>
        You are always in control: listen, record again, or cancel before continuing.
      </p>
      <span className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {phaseAnnouncement(state.phase, state.countdown)}
      </span>
      {isBusy ? <span className={styles.srOnly} aria-live="off">Recording controls are active.</span> : null}
    </section>
  );
}
