"use client";

import { useId, useState } from "react";
import { Send } from "lucide-react";

type ClinicianReportShareButtonProps = {
  pdfUrl: string;
  className?: string;
  downloadName?: string;
};

export function ClinicianReportShareButton({
  pdfUrl,
  className = "button button--secondary",
  downloadName = "soundcue-parkinsons-trend-report.pdf",
}: ClinicianReportShareButtonProps) {
  const statusId = useId();
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function shareReport() {
    if (sharing) return;
    setSharing(true);
    setStatus(null);

    try {
      const response = await fetch(pdfUrl, {
        credentials: "same-origin",
        headers: { Accept: "application/pdf" },
      });
      if (!response.ok) throw new Error("REPORT_DOWNLOAD_FAILED");

      const file = new File([await response.blob()], downloadName, {
        type: "application/pdf",
      });
      const shareData = {
        files: [file],
        title: "SoundCue Parkinson’s voice screening trend report",
        text: "Please review my attached SoundCue Parkinson’s voice screening trend report. SoundCue is a screening aid, not a diagnosis.",
      };

      if (typeof navigator.share === "function" && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        setStatus("The secure share menu was opened for your report.");
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      const download = document.createElement("a");
      download.href = objectUrl;
      download.download = downloadName;
      download.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);

      setStatus("The report was downloaded. Share it through your clinician’s secure messaging system.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("Sharing was canceled. No report was sent.");
      } else {
        setStatus("We could not prepare the report for sharing. Download it and attach it through your clinician’s secure messaging system.");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <button
        aria-describedby={status ? statusId : undefined}
        className={className}
        disabled={sharing}
        onClick={() => void shareReport()}
        type="button"
      >
        <Send aria-hidden="true" size={20} />
        {sharing ? "Preparing report…" : "Share report"}
      </button>
      {status ? <span className="sr-only" id={statusId} role="status">{status}</span> : null}
    </>
  );
}
