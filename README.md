# SoundCue

SoundCue is a desktop-first voice screening aid for noticing acoustic patterns that may be associated with vocal impairment. It is not a diagnostic tool and cannot confirm or rule out Parkinson's disease.

This repository contains the complete public-beta product surface: versioned consent, Supabase authentication, browser recording and quality checks, private audio retention, an analyzer adapter, results, PDF summaries, history, playback, deletion, and legal/accessibility pages.

The included `DummySignalAnalyzer` is deterministic development infrastructure only. It is not clinically validated. The server refuses to run it when `VERCEL_ENV=production`; a validated `Analyzer` implementation and approved model version must replace it before any public health result is served.

## Stack

- Next.js App Router, React, TypeScript, CSS modules
- Supabase Auth, Postgres, Row Level Security, and private Storage
- Web Audio and `MediaRecorder` for capture and acoustic feature extraction
- Zod at API boundaries
- Vitest, pgTAP, Playwright, and axe for verification

## Local setup

Requirements: Node.js 20+, Docker, and the Supabase CLI.

```bash
npm install
npm run supabase:start
npm run supabase:reset
```

Copy `.env.example` to `.env.local`, then fill the values printed by `supabase status -o env`. Use the local publishable key for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the legacy local service-role JWT for `SUPABASE_SERVICE_ROLE_KEY`.

```bash
npm run dev
```

The app runs at `http://localhost:3000`; Supabase Studio runs at `http://127.0.0.1:54323`, and local email is visible at `http://127.0.0.1:54324`.

## Synthetic demo

The demo seed is explicit and hard-blocked in production. It creates one account with five clearly labeled synthetic sessions and no recordings.

```bash
SOUNDCUE_ALLOW_DEMO_SEED=true \
SOUNDCUE_DEMO_EMAIL=demo@example.test \
SOUNDCUE_DEMO_PASSWORD='choose-a-local-password' \
npm run seed:demo
```

No demo credentials are committed. Normal accounts always start with empty history.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run qa:visual
npm run supabase:reset
npx supabase test db
```

The Playwright suite uses `tests/fixtures/sustained-ah.wav` only as a browser microphone fixture. It covers consent, signup, retained recording upload, placeholder analysis, result, PDF, history, deletion, permanent account deletion, the synthetic demo account, responsive layout, and an axe scan.

## Analyzer replacement

The model boundary is `src/types/screening.ts`:

```ts
interface Analyzer {
  analyze(input: AnalysisInput): Promise<AnalysisResult>;
}
```

Implement a validated adapter, register it in `src/lib/analyzer/index.ts`, require its approved version through deployment configuration, and keep clinical thresholds and reviewed result wording inside the adapter/copy mapping—not in presentation components. The UI intentionally never exposes a probability or raw score.

## Data and privacy behavior

- `profiles`, `consent_events`, and `screenings` are protected by forced RLS.
- Browser clients can read only their own rows, append current consent, and update only `sound_cues_enabled`.
- Model-owned fields and screening lifecycle mutations are reserved for authenticated Route Handlers using the server-only service role after an ownership check.
- Recordings live under `userId/screeningId/source.ext` in the private `recordings` bucket with a 10 MiB limit and an audio MIME allowlist.
- Audio and PDFs are streamed only through authenticated, `no-store` endpoints.
- Screening deletion removes storage first; account deletion requires recent authentication and removes all retained storage before the Auth user.
- Application code avoids logging email addresses, audio, features, results, storage paths, access tokens, or PDF contents.

## Public-launch gates

Do not enable public signup or public screening results until all of the following are complete:

1. Replace the dummy analyzer with the clinically validated implementation and approved version.
2. Complete clinical, legal, privacy, security, and applicable regulatory review.
3. Receive counsel approval for consent, Privacy, Terms, Accessibility, and retention/deletion copy.
4. Configure production Supabase redirect URLs, Google OAuth, CAPTCHA, custom SMTP, rate limits, backup/retention controls, and a private US-region project.
5. Configure Vercel/Supabase secrets and compliance offerings appropriate to the actual business relationship; platform settings alone do not establish HIPAA compliance.
6. Run cross-browser, accessibility, RLS/storage isolation, visual regression, incident-response, and deletion-recovery acceptance checks in the production-like environment.

SoundCue does not claim HIPAA compliance.
