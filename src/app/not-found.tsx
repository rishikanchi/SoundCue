import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";

export default function NotFound() {
  return (
    <AppShell quietHeader>
      <div className="page-container" style={{ paddingBlock: "clamp(70px, 10vw, 150px)", maxWidth: 900 }}>
        <p className="muted">Page not found</p>
        <h1 className="section-title" style={{ marginTop: 10 }}>We couldn&apos;t find that page.</h1>
        <p className="lead" style={{ marginTop: 20 }}>The link may have changed, or this screening may no longer be available.</p>
        <Link className="button button--primary" style={{ marginTop: 30 }} href="/">Return to SoundCue</Link>
      </div>
    </AppShell>
  );
}
