"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { persistPendingConsent, setPendingConsent } from "@/lib/auth/consent";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function beginScreening(formData: FormData) {
  if (formData.get("screening-consent") !== "accepted") {
    redirect("/?consent=required#consent");
  }

  await setPendingConsent();
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "production") redirect("/auth/sign-up?configuration=required");
    redirect("/screenings/new?preview=1");
  }

  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-up?next=/screenings/new");
  await persistPendingConsent(user.id);
  redirect("/screenings/new");
}
