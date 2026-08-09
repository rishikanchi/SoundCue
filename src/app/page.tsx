import { AudioLines, FileText, LockKeyhole, Mic } from "lucide-react";
import { AcousticVisual } from "@/components/brand/acoustic-visual";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ConsentForm } from "@/components/landing/consent-form";
import styles from "./page.module.css";

const steps = [
  {
    number: "1",
    title: "Record your voice",
    body: "You’ll be guided to record a sustained “ahhh” for at least 5 seconds.",
    icon: Mic,
  },
  {
    number: "2",
    title: "We analyze the signal",
    body: "SoundCue examines voice patterns that research has associated with Parkinson’s disease.",
    icon: AudioLines,
  },
  {
    number: "3",
    title: "Review your result",
    body: "You’ll see a Parkinson’s voice screening summary and a clear next step for speaking with a clinician.",
    icon: FileText,
  },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main id="main-content">
        <section className={`page-container ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <h1 className="page-title">A clearer signal for Parkinson’s voice screening.</h1>
            <p className={`lead ${styles.heroLead}`}>
              Record a sustained “ahhh” and SoundCue will look for voice patterns that can be
              associated with Parkinson’s disease. It takes about one minute and cannot diagnose Parkinson’s.
            </p>
            <ConsentForm />
            <p className={styles.privacyNote}>
              <LockKeyhole aria-hidden="true" size={20} strokeWidth={1.7} />
              Your recording is private and can be deleted from your account.
            </p>
          </div>
          <AcousticVisual className={styles.heroVisual} />
        </section>

        <section id="how-it-works" className={styles.steps} aria-labelledby="steps-heading">
          <h2 id="steps-heading" className="sr-only">
            How SoundCue works
          </h2>
          <div className={`page-container ${styles.stepsInner}`}>
            {steps.map(({ number, title, body, icon: Icon }) => (
              <article className={styles.step} key={number}>
                <div className={styles.stepNumber} aria-hidden="true">
                  {number}
                </div>
                <div className={styles.stepIcon} aria-hidden="true">
                  <Icon size={37} strokeWidth={1.45} />
                </div>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
