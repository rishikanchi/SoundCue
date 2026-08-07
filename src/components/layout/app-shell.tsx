import type { ReactNode } from "react";
import { DisclaimerBar } from "./disclaimer-bar";
import { SiteHeader } from "./site-header";

type AppShellProps = {
  children: ReactNode;
  active?: "new" | "history" | "account";
  displayName?: string;
  placeholder?: boolean;
  quietHeader?: boolean;
};

export function AppShell({
  children,
  active,
  displayName,
  placeholder = false,
  quietHeader = false,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <SiteHeader
        active={active}
        authenticated={!quietHeader}
        displayName={displayName}
        quiet={quietHeader}
      />
      <main id="main-content" className="app-shell__main">
        {children}
      </main>
      <DisclaimerBar placeholder={placeholder} />
    </div>
  );
}
