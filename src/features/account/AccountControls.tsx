"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Trash2, Volume2 } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { setSoundCuesEnabled } from "@/features/recording/useSoundPreference";
import { createClient } from "@/lib/supabase/browser";
import styles from "./account.module.css";

type AccountControlsProps = { email: string; initialSoundCues: boolean; preview?: boolean };

export function AccountControls({ email, initialSoundCues, preview = false }: AccountControlsProps) {
  const router = useRouter();
  const [sounds, setSounds] = useState(initialSoundCues);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function changeSounds(enabled: boolean) {
    setSounds(enabled);
    setSoundCuesEnabled(enabled);
    if (preview) return;
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = user
      ? await supabase.from("profiles").update({ sound_cues_enabled: enabled }).eq("user_id", user.id)
      : { error: new Error("No active session") };
    setSaving(false);
    setMessage(error ? "We could not save that preference." : "Sound preference saved.");
  }

  async function deleteAccount() {
    if (confirmation !== "DELETE" || deleting || preview) return;
    setDeleting(true);
    setMessage(null);
    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    if (response.ok) {
      router.replace("/?account=deleted");
      router.refresh();
      return;
    }
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    setMessage(body?.error?.message ?? "We could not delete your account. Please try again.");
    setDeleting(false);
  }

  return (
    <div className={styles.settings}>
      {preview ? <div className={styles.previewNote}>Account settings are shown in preview mode. Changes remain only in this browser.</div> : null}
      <section className={styles.card} aria-labelledby="details-title">
        <div><p className={styles.label}>Account details</p><h2 id="details-title">Your sign-in</h2><p>Used to protect your private screening history.</p></div>
        <div className={styles.detail}><span>Email</span><strong>{email}</strong></div>
      </section>

      <section className={styles.card} aria-labelledby="sound-title">
        <div className={styles.icon}><Volume2 aria-hidden="true" size={28} /></div>
        <div className={styles.cardCopy}><p className={styles.label}>Recording guidance</p><h2 id="sound-title">Sound cues</h2><p>Soft tones mark the countdown, start, stop, and microphone warnings. Visual guidance always appears too.</p></div>
        <label className={styles.switch}>
          <input type="checkbox" checked={sounds} onChange={(event) => void changeSounds(event.target.checked)} />
          <span aria-hidden="true" /><b>{sounds ? "On" : "Off"}</b>
        </label>
        {saving ? <span className="sr-only" role="status">Saving preference</span> : null}
      </section>

      <section className={styles.card} aria-labelledby="session-title">
        <div><p className={styles.label}>Session</p><h2 id="session-title">Sign out on this device</h2><p>You can sign back in whenever you want to review your history.</p></div>
        {preview ? <Link className="button button--secondary" href="/"><LogOut aria-hidden="true" size={20} /> Leave preview</Link> : <form action={signOut}><button className="button button--secondary" type="submit"><LogOut aria-hidden="true" size={20} /> Sign out</button></form>}
      </section>

      <section className={`${styles.card} ${styles.dangerCard}`} aria-labelledby="delete-title">
        <div className={styles.icon}><Trash2 aria-hidden="true" size={28} /></div>
        <div className={styles.cardCopy}><p className={styles.label}>Permanent deletion</p><h2 id="delete-title">Delete your account</h2><p>This permanently removes your retained recordings, screening results, consent history, and account. This cannot be undone. For your protection, you may be asked to sign in again first.</p>
          <label className={styles.confirmLabel} htmlFor="delete-confirmation">Type <strong>DELETE</strong> to confirm</label>
          <input id="delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" disabled={preview} />
          <button className="button button--danger" type="button" disabled={confirmation !== "DELETE" || deleting || preview} onClick={() => void deleteAccount()}>{deleting ? "Deleting account…" : "Permanently delete account"}</button>
        </div>
      </section>
      {message ? <p className={styles.message} role="status">{message}</p> : null}
    </div>
  );
}
