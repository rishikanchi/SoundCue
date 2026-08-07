import { createClient, type User } from "@supabase/supabase-js";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

if (
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL_ENV === "production"
) {
  throw new Error("The synthetic demo seed is disabled in production.");
}

if (process.env.SOUNDCUE_ALLOW_DEMO_SEED !== "true") {
  throw new Error("Set SOUNDCUE_ALLOW_DEMO_SEED=true to confirm demo seeding.");
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const demoEmail = required("SOUNDCUE_DEMO_EMAIL");
const demoPassword = required("SOUNDCUE_DEMO_PASSWORD");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email: string): Promise<User | undefined> {
  const normalizedEmail = email.trim().toLowerCase();

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error("DEMO_USER_LOOKUP_FAILED");

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail,
    );
    if (match) return match;
    if (data.users.length < 1000) return undefined;
  }
}

async function ensureDemoUser(): Promise<User> {
  const existing = await findUserByEmail(demoEmail);
  if (existing) {
    if (existing.user_metadata.account_kind !== "synthetic_demo") {
      throw new Error("DEMO_EMAIL_BELONGS_TO_NON_DEMO_ACCOUNT");
    }

    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password: demoPassword,
      email_confirm: true,
      user_metadata: {
        ...existing.user_metadata,
        account_kind: "synthetic_demo",
      },
    });
    if (error) throw new Error("DEMO_USER_UPDATE_FAILED");
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: demoEmail,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { account_kind: "synthetic_demo" },
  });
  if (error) throw new Error("DEMO_USER_CREATE_FAILED");
  return data.user;
}

const findingSets = [
  ["lower", "lower", "lower"],
  ["lower", "moderate", "lower"],
  ["moderate", "moderate", "lower"],
  ["moderate", "higher", "moderate"],
  ["higher", "moderate", "higher"],
] as const;

const samples = [
  { daysAgo: 112, score: 0.18, band: "fewer" },
  { daysAgo: 84, score: 0.31, band: "fewer" },
  { daysAgo: 56, score: 0.47, band: "some" },
  { daysAgo: 28, score: 0.58, band: "some" },
  { daysAgo: 0, score: 0.72, band: "more" },
] as const;

async function main() {
  const user = await ensureDemoUser();

  const { error: profileError } = await admin.from("profiles").upsert({
    user_id: user.id,
    sound_cues_enabled: true,
  });
  if (profileError) throw new Error("DEMO_PROFILE_UPSERT_FAILED");

  const { error: consentError } = await admin.from("consent_events").upsert(
    {
      user_id: user.id,
      document_version: process.env.CONSENT_DOCUMENT_VERSION ?? "2026-08-01",
    },
    { onConflict: "user_id,document_version", ignoreDuplicates: true },
  );
  if (consentError) throw new Error("DEMO_CONSENT_SEED_FAILED");

  const { error: cleanupError } = await admin
    .from("screenings")
    .delete()
    .eq("user_id", user.id)
    .eq("is_synthetic", true);
  if (cleanupError) throw new Error("DEMO_SESSION_CLEANUP_FAILED");

  const now = Date.now();
  const rows = samples.map((sample, index) => {
    const timestamp = new Date(
      now - sample.daysAgo * 24 * 60 * 60 * 1000,
    ).toISOString();
    const levels = findingSets[index];

    return {
      user_id: user.id,
      status: "completed" as const,
      feature_version: "synthetic-v1",
      features: { source: "synthetic_demo", sample: index + 1 },
      quality: {
        passed: true,
        reasons: [],
        source: "synthetic_demo",
      },
      analyzer_kind: "dummy" as const,
      analyzer_version: "dummy-demo-v1",
      score: sample.score,
      band: sample.band,
      findings: [
        { code: "voice_steadiness", level: levels[0] },
        { code: "pitch_variation", level: levels[1] },
        { code: "breath_support", level: levels[2] },
      ],
      is_synthetic: true,
      created_at: timestamp,
      updated_at: timestamp,
      completed_at: timestamp,
    };
  });

  const { error: insertError } = await admin.from("screenings").insert(rows);
  if (insertError) throw new Error("DEMO_SESSION_INSERT_FAILED");

  process.stdout.write("Seeded one demo account with five synthetic sessions.\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown seed error";
  process.stderr.write(`Demo seed failed: ${message}\n`);
  process.exitCode = 1;
});
