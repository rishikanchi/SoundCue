"use client";

import { useRouter } from "next/navigation";
import { VoiceRecorder } from "@/features/recording/VoiceRecorder";
import type { AcceptedRecording } from "@/lib/audio/types";

type RecordingFlowProps = {
  preview?: boolean;
};

export function RecordingFlow({ preview = false }: RecordingFlowProps) {
  const router = useRouter();

  async function accept(recording: AcceptedRecording) {
    if (preview) {
      sessionStorage.setItem(
        "soundcue-preview-recording",
        JSON.stringify({
          durationSeconds: recording.durationSeconds,
          waveformSamples: recording.waveformSamples,
          features: recording.features,
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
    <VoiceRecorder onAccept={accept} showIntro={false} />
  );
}
