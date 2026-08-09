# SoundCue

SoundCue is a desktop-first voice screening aid for noticing acoustic patterns that may be associated with vocal impairment. It is not a diagnostic tool and cannot confirm or rule out Parkinson's disease.

This repository contains the complete research-screening product surface: versioned consent, Supabase authentication, browser recording and quality checks, private audio retention, protected inference, expanded results, accessible clinician reports, history, playback, deletion, and legal/accessibility pages.

The deployed analyzer is a three-component age-plus-audio research model: AST layer 3 (40%), AST layer 6 (40%), and WavLM layer 1 (20%). It is not independently validated or diagnostic. Production fails closed unless `ANALYZER_MODE=research`; it never falls back to the retained local-only `DummySignalAnalyzer`. Do not claim the unavailable four-component model's 0.9872 result for this service.

## Stack

- Next.js App Router, React, TypeScript, CSS modules
- Supabase Auth, Postgres, Row Level Security, and private Storage
- Web Audio and `MediaRecorder` for capture and acoustic feature extraction
- A private Python 3.12 inference service with pinned AST and WavLM revisions
- `@react-pdf/renderer` for selectable, vector-based clinician reports
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

Google OAuth is rendered only when `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` and the corresponding Supabase provider credentials are configured. Hosted demos without those third-party credentials use the complete email/password flow without exposing an inert OAuth control.

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

The Playwright suite uses `tests/fixtures/sustained-ah.wav` only as a browser microphone fixture. It covers consent, age entry, signup, retained recording upload, research analysis, expanded result, HTML/PDF report, history, deletion, permanent account deletion, the synthetic demo account, responsive layout, and an axe scan.

## Research inference

The model boundary remains `src/types/screening.ts`:

```ts
interface Analyzer {
  analyze(input: AnalysisInput): Promise<AnalysisResult>;
}
```

`ResearchModelAnalyzer` signs raw-audio requests to the separate `model-service/` project. Configure `SOUNDCUE_INFERENCE_URL`, a shared `SOUNDCUE_INFERENCE_HMAC_SECRET`, and the exact `SOUNDCUE_MODEL_ARTIFACT_SHA256`. The service verifies the bundled artifact before loading it, rejects stale/tampered/replayed requests, standardizes audio to the research acquisition bandwidth, and returns a versioned result. The UI never exposes an individual score, component score, or probability.

The inference service has its own Python dependencies, tests, Vercel configuration, versioned manifest, and artifact builder. See `model-service/README.md` for local and deployment commands.

## Data and privacy behavior

- `profiles`, `consent_events`, and `screenings` are protected by forced RLS.
- Browser clients can read only their own rows, append current consent, and update only `sound_cues_enabled`.
- Model-owned fields and screening lifecycle mutations are reserved for authenticated Route Handlers using the server-only service role after an ownership check.
- Recordings live under `userId/screeningId/source.ext` in the private `recordings` bucket with a 4 MiB limit and a browser-audio MIME allowlist.
- Age is collected as a whole number from 18 to 85 for every screening and is not copied into the account profile.
- Research component outputs and technical measurements live in a service-role-only table. Browser roles receive only categorical bands and reviewed observation codes.
- Audio and PDFs are streamed only through authenticated, `no-store` endpoints.
- Screening deletion removes storage first; account deletion requires recent authentication and removes all retained storage before the Auth user.
- Application code avoids logging email addresses, audio, features, results, storage paths, access tokens, or PDF contents.

## Public-launch gates

Do not enable public signup or public screening results until all of the following are complete:

1. Pass the documented model/preprocessing parity, determinism, sex-zero-effect, and offline-reference checks across all 81 research recordings.
2. Pass the Vercel 4 GB memory and latency gates (warm p95 under 25 seconds, cold p95 under 75 seconds, all requests under 120 seconds).
3. Complete clinical, legal, privacy, security, and applicable regulatory review, including clinician approval of result/report wording.
4. Receive counsel approval for consent, Privacy, Terms, Accessibility, contact details, and retention/deletion content.
5. Configure production Supabase redirect URLs, Google OAuth, CAPTCHA, custom SMTP, backups, a private US-region project, and the database-backed screening limit.
6. Configure separate Vercel web/inference projects and server-only secrets; platform settings alone do not establish HIPAA compliance.
7. Pass cross-browser, accessibility, RLS/storage isolation, HMAC/replay, PDF, visual-regression, load, incident-response, and deletion-recovery acceptance checks.

SoundCue does not claim HIPAA compliance.
