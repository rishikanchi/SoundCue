import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { SoundCueLogo } from "@/components/brand/logo";

type SiteHeaderProps = {
  active?: "new" | "history" | "account";
  authenticated?: boolean;
  displayName?: string;
  quiet?: boolean;
};

export function SiteHeader({
  active,
  authenticated = false,
  displayName = "Rishi",
  quiet = false,
}: SiteHeaderProps) {
  const initial = displayName.trim().charAt(0).toUpperCase() || "S";

  return (
    <header className="site-header">
      <div className="site-header__inner page-container">
        <SoundCueLogo />
        {quiet ? null : (
          <nav aria-label="Primary navigation" className="site-header__nav">
            {authenticated ? (
              <>
                <Link aria-current={active === "new" ? "page" : undefined} href="/screenings/new">
                  New screening
                </Link>
                <Link aria-current={active === "history" ? "page" : undefined} href="/history">
                  Your history
                </Link>
                <Link
                  aria-current={active === "account" ? "page" : undefined}
                  className="user-link"
                  href="/account"
                >
                  <span className="user-link__avatar" aria-hidden="true">
                    {initial}
                  </span>
                  <span>{displayName}</span>
                  <ChevronDown aria-hidden="true" size={17} strokeWidth={1.8} />
                </Link>
              </>
            ) : (
              <>
                <Link href="/#how-it-works">How it works</Link>
                <Link href="/history">Your history</Link>
                <Link className="site-header__sign-in" href="/auth/sign-in">
                  Sign in
                </Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
