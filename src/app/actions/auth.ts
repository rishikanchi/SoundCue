"use server";

import { redirect } from "next/navigation";
import { emailSchema, passwordSchema, type AuthFormState } from "@/lib/auth/schemas";
import { persistPendingConsent } from "@/lib/auth/consent";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function unavailable(): AuthFormState {
  return { message: "Account services are not configured in this environment yet." };
}

export async function signUp(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return unavailable();
  const emailResult = emailSchema.safeParse(formData.get("email"));
  const passwordResult = passwordSchema.safeParse(formData.get("password"));
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!emailResult.success || !passwordResult.success || confirmPassword !== formData.get("password")) {
    return {
      errors: {
        email: emailResult.success ? undefined : emailResult.error.issues.map((issue) => issue.message),
        password: passwordResult.success
          ? undefined
          : passwordResult.error.issues.map((issue) => issue.message),
        confirmPassword:
          confirmPassword === formData.get("password") ? undefined : ["Passwords do not match."],
      },
    };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email: emailResult.data,
    password: passwordResult.data,
    options: { emailRedirectTo: `${siteUrl}/auth/callback?next=/screenings/new` },
  });
  if (error) return { message: "We couldn’t create that account. Check the details and try again." };
  if (data.user && data.session) {
    await persistPendingConsent(data.user.id);
    redirect("/screenings/new");
  }
  redirect(`/auth/check-email?email=${encodeURIComponent(emailResult.data)}`);
}

export async function signIn(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return unavailable();
  const emailResult = emailSchema.safeParse(formData.get("email"));
  const passwordResult = passwordSchema.safeParse(formData.get("password"));
  if (!emailResult.success || !passwordResult.success) {
    return {
      errors: {
        email: emailResult.success ? undefined : emailResult.error.issues.map((issue) => issue.message),
        password: passwordResult.success
          ? undefined
          : passwordResult.error.issues.map((issue) => issue.message),
      },
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailResult.data,
    password: passwordResult.data,
  });
  if (error || !data.user) return { message: "Email or password wasn’t recognized." };
  await persistPendingConsent(data.user.id);
  redirect("/screenings/new");
}

export async function signInWithGoogle() {
  if (!isSupabaseConfigured()) redirect("/auth/sign-in?configuration=required");
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl}/auth/callback?next=/screenings/new` },
  });
  if (error || !data.url) redirect("/auth/sign-in?error=oauth");
  redirect(data.url);
}

export async function requestPasswordReset(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return unavailable();
  const emailResult = emailSchema.safeParse(formData.get("email"));
  if (!emailResult.success) {
    return { errors: { email: emailResult.error.issues.map((issue) => issue.message) } };
  }
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  await supabase.auth.resetPasswordForEmail(emailResult.data, {
    redirectTo: `${siteUrl}/auth/callback?next=/auth/update-password`,
  });
  return {
    message: "If an account exists for that address, a reset link is on its way.",
  };
}

export async function updatePassword(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return unavailable();
  const passwordResult = passwordSchema.safeParse(formData.get("password"));
  if (!passwordResult.success) {
    return { errors: { password: passwordResult.error.issues.map((issue) => issue.message) } };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: passwordResult.data });
  if (error) return { message: "We couldn’t update your password. Request a new reset link." };
  redirect("/auth/sign-in?password=updated");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
