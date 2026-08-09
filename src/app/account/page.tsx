import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { AccountControls } from "@/features/account/AccountControls";
import { getDisplayName, requireUser } from "@/lib/auth/current-user";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import styles from "@/features/account/account.module.css";

export const metadata: Metadata = { title: "Account settings" };

export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    return <AppShell active="account" displayName="Sample" placeholder><main className={`${styles.account} page-container`}><header className={styles.heading}><p className={styles.eyebrow}>Your account</p><h1>Settings and privacy.</h1><p>Choose how SoundCue guides your Parkinson’s voice screenings and manage the information attached to your account.</p></header><AccountControls email="sample@soundcue.local" initialSoundCues preview /></main></AppShell>;
  }
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("sound_cues_enabled").eq("user_id", user.id).maybeSingle();
  return <AppShell active="account" displayName={getDisplayName(user)}><main className={`${styles.account} page-container`}><header className={styles.heading}><p className={styles.eyebrow}>Your account</p><h1>Settings and privacy.</h1><p>Choose how SoundCue guides your Parkinson’s voice screenings and manage the information attached to your account.</p></header><AccountControls email={user.email ?? "Email unavailable"} initialSoundCues={profile?.sound_cues_enabled ?? true} /></main></AppShell>;
}
