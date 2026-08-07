import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const CONSENT_COOKIE = "soundcue-pending-consent";
export const CONSENT_VERSION =
  process.env.CONSENT_DOCUMENT_VERSION ?? "2026-08-01";

function getSecret() {
  const secret =
    process.env.CONSENT_SIGNING_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "soundcue-local-consent-only";
  throw new Error("CONSENT_SIGNING_SECRET is required in production.");
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export async function setPendingConsent() {
  const issuedAt = Date.now().toString();
  const value = `${CONSENT_VERSION}.${issuedAt}`;
  (await cookies()).set(CONSENT_COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24,
    path: "/",
  });
}

export async function hasValidPendingConsent() {
  const raw = (await cookies()).get(CONSENT_COOKIE)?.value;
  if (!raw) return false;
  const [version, issuedAt, signature] = raw.split(".");
  if (!version || !issuedAt || !signature || version !== CONSENT_VERSION) return false;
  const age = Date.now() - Number(issuedAt);
  if (!Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000) return false;
  const expected = sign(`${version}.${issuedAt}`);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export async function persistPendingConsent(userId: string) {
  if (!(await hasValidPendingConsent())) return false;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) throw new Error("Unable to record consent.");
  const { error } = await supabase.from("consent_events").insert({
    document_version: CONSENT_VERSION,
  });
  if (error && error.code !== "23505") throw new Error("Unable to record consent.");
  (await cookies()).delete(CONSENT_COOKIE);
  return true;
}

export async function userHasCurrentConsent(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("consent_events")
    .select("id")
    .eq("user_id", userId)
    .eq("document_version", CONSENT_VERSION)
    .maybeSingle();
  return Boolean(data);
}
