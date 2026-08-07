"use client";

import { useEffect } from "react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Error details are intentionally not logged here because protected health-flow data
    // can be present in component state. Hosting logs retain the coarse request failure.
  }, []);
  return (
    <main id="main-content" className="page-container" style={{ paddingBlock: "clamp(70px, 10vw, 150px)", maxWidth: 900 }}>
      <p className="muted">Something went wrong</p>
      <h1 className="section-title" style={{ marginTop: 10 }}>SoundCue needs another moment.</h1>
      <p className="lead" style={{ marginTop: 20 }}>Your account information has not been changed. Try this page again.</p>
      <button className="button button--primary" style={{ marginTop: 30 }} type="button" onClick={reset}>Try again</button>
    </main>
  );
}
