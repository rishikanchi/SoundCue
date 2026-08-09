import type { Metadata } from "next";
import { Check } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { RecordingFlow } from "@/features/screening/RecordingFlow";
import { getCurrentUser, getDisplayName } from "@/lib/auth/current-user";
import { userHasCurrentConsent } from "@/lib/auth/consent";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { redirect } from "next/navigation";
import styles from "./recording-page.module.css";

export const metadata: Metadata = { title: "Parkinson’s voice screening" };

export default async function NewScreeningPage() {
  const configured = isSupabaseConfigured();
  const user = configured ? await getCurrentUser() : null;
  if (configured && !user) redirect("/auth/sign-in?next=/screenings/new");
  if (user && !(await userHasCurrentConsent(user.id))) redirect("/#consent");

  return (
    <AppShell active="new" displayName={getDisplayName(user)}>
      <div className={`page-container ${styles.layout}`}>
        <aside className={styles.guidance}>
          <h1>Record your Parkinson’s voice screening.</h1>
          <p>
            Enter your age, take a comfortable breath, then hold one clear, steady “ahhh” for about 6 seconds.
          </p>
          <div className={styles.rule} />
          <h2>Before you begin:</h2>
          <ul>
            <li>
              <span><Check aria-hidden="true" size={17} strokeWidth={2.2} /></span>
              Sit comfortably
            </li>
            <li>
              <span><Check aria-hidden="true" size={17} strokeWidth={2.2} /></span>
              Keep your microphone about a hand’s width away
            </li>
            <li>
              <span><Check aria-hidden="true" size={17} strokeWidth={2.2} /></span>
              Use your normal voice
            </li>
          </ul>
          {!configured ? (
            <p className={styles.previewNote}>
              Local preview mode — connect Supabase to save this screening to an account.
            </p>
          ) : null}
        </aside>
        <section className={styles.recorderRegion} aria-label="Voice recording">
          <RecordingFlow preview={!configured} />
        </section>
      </div>
    </AppShell>
  );
}
