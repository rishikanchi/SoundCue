import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav className="page-container site-footer__inner" aria-label="Legal">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/accessibility">Accessibility</Link>
      </nav>
    </footer>
  );
}
