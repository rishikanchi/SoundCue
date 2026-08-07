import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldPlus } from "lucide-react";
import { AcousticVisual } from "@/components/brand/acoustic-visual";
import { SoundCueLogo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/layout/site-footer";
import styles from "./auth.module.css";

type AuthScreenProps = {
  children: ReactNode;
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
};

export function AuthScreen({
  children,
  title,
  description,
  backHref = "/",
  backLabel = "About SoundCue",
}: AuthScreenProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.backLink} href={backHref}>
          <span aria-hidden="true">←</span> {backLabel}
        </Link>
        <SoundCueLogo />
        <span className={styles.headerSpacer} aria-hidden="true" />
      </header>
      <main id="main-content" className={styles.main}>
        <section className={styles.formRegion}>
          <h1>{title}</h1>
          <p className={styles.description}>{description}</p>
          {children}
        </section>
        <aside className={styles.visualRegion} aria-label="Privacy note">
          <AcousticVisual variant="quiet" />
          <div className={styles.privacyStatement}>
            <span aria-hidden="true">
              <ShieldPlus size={27} strokeWidth={1.5} />
            </span>
            <p>Your recordings and results are private to your account.</p>
          </div>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
