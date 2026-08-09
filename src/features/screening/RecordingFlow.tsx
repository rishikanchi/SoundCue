"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { VoiceRecorder } from "@/features/recording/VoiceRecorder";
import type { AcceptedRecording } from "@/lib/audio/types";
import styles from "./RecordingFlow.module.css";

type RecordingFlowProps = {
  preview?: boolean;
};

export function RecordingFlow({ preview = false }: RecordingFlowProps) {
  const router = useRouter();
  const ageInputId = useId();
  const [ageText, setAgeText] = useState("");
  const ageYears = Number(ageText);
  const ageIsValid = Number.isInteger(ageYears) && ageYears >= 18 && ageYears <= 85;

  async function accept(recording: AcceptedRecording) {
    if (preview) {
      sessionStorage.setItem(
        "soundcue-preview-recording",
        JSON.stringify({
          durationSeconds: recording.durationSeconds,
          waveformSamples: recording.waveformSamples,
          features: recording.features,
          ageYears,
        }),
      );
      router.push("/screenings/preview/analyzing?preview=1");
      return;
    }

    const createResponse = await fetch("/api/screenings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        durationSeconds: recording.durationSeconds,
        mimeType: recording.mimeType,
        sizeBytes: recording.blob.size,
        ageYears,
      }),
    });
    if (!createResponse.ok) throw new Error("Unable to create screening.");
    const created = (await createResponse.json()) as { screening: { id: string } };

    const upload = new FormData();
    upload.set(
      "audio",
      new File([recording.blob], `source.${recording.extension}`, {
        type: recording.mimeType,
      }),
    );
    upload.set("clientMetrics", JSON.stringify(recording.features));
    const completeResponse = await fetch(`/api/screenings/${created.screening.id}/complete`, {
      method: "POST",
      body: upload,
    });
    if (!completeResponse.ok) throw new Error("Unable to upload recording.");
    sessionStorage.setItem(
      `soundcue-waveform-${created.screening.id}`,
      JSON.stringify(recording.waveformSamples),
    );
    router.push(`/screenings/${created.screening.id}/analyzing`);
  }

  return (
    <div className={styles.flow}>
      <div className={styles.ageCard}>
        <div>
          <label htmlFor={ageInputId}>Your age today</label>
          <p id={`${ageInputId}-help`}>
            The Parkinson’s voice research model combines your recording with age. Age is saved with this screening only.
          </p>
        </div>
        <div className={styles.ageField}>
          <input
            id={ageInputId}
            type="number"
            inputMode="numeric"
            min={18}
            max={85}
            step={1}
            value={ageText}
            onChange={(event) => setAgeText(event.target.value)}
            aria-describedby={`${ageInputId}-help ${ageInputId}-status`}
            aria-invalid={ageText.length > 0 && !ageIsValid}
            autoComplete="off"
          />
          <span>years</span>
        </div>
        <p className={styles.ageStatus} id={`${ageInputId}-status`} aria-live="polite">
          {ageText.length === 0
            ? "Enter a whole number from 18 to 85 before recording."
            : ageIsValid
              ? "Age is ready for this screening."
              : "Age must be a whole number from 18 to 85."}
        </p>
      </div>
      <VoiceRecorder onAccept={accept} showIntro={false} disabled={!ageIsValid} />
    </div>
  );
}
