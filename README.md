# SoundCue

SoundCue is a desktop-first voice screening aid for noticing acoustic patterns that may be associated with vocal impairment. It is not a diagnostic tool and cannot confirm or rule out Parkinson's disease.

This repository contains the complete research-screening product surface: versioned consent, Supabase authentication, browser recording and quality checks, private audio retention, protected inference, expanded results, accessible clinician reports, history, playback, deletion, and legal/accessibility pages.

The deployed analyzer is a three-component age-plus-audio research model: AST layer 3 (40%), AST layer 6 (40%), and WavLM layer 1 (20%). It is not independently validated or diagnostic. Production fails closed unless `ANALYZER_MODE=research`; it never falls back to the retained local-only `DummySignalAnalyzer`. Do not claim the unavailable four-component model's 0.9872 result for this service.

## Repository contents

| Requirement | Location |
| --- | --- |
| Source code | [`src/`](src/), [`model-service/`](model-service/), [`supabase/`](supabase/), and [`scripts/`](scripts/) |
| Project README | This file |
| Setup instructions | [Detailed setup guide](docs/SETUP.md) |
| Architecture diagram | [Architecture and trust boundaries](docs/ARCHITECTURE.md) |
| How it works | [End-to-end technical explanation](docs/HOW_IT_WORKS.md) |

The source tree is organized by responsibility: the Next.js application lives in `src/`, database migrations and policy tests live in `supabase/`, the private Python inference service lives in `model-service/`, and browser end-to-end tests live in `tests/`.

## Stack

- Next.js App Router, React, TypeScript, CSS modules
- Supabase Auth, Postgres, Row Level Security, and private Storage
- Web Audio and `MediaRecorder` for capture and acoustic feature extraction
- A private Python 3.12 inference service with pinned AST and WavLM revisions
- `@react-pdf/renderer` for selectable, vector-based clinician reports
- Zod at API boundaries
- Vitest, pgTAP, Playwright, and axe for verification

## Setup instructions

For a UI-only preview, Node.js 20.9 or newer is sufficient:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. With no Supabase environment variables, the app deliberately uses a non-persistent preview flow.

For accounts, persistence, private recording storage, and API lifecycle testing, Docker and the Supabase CLI are also required:

```bash
npm run supabase:start
npm run supabase:reset
cp .env.example .env.local
```

Fill `.env.local` with the values printed by `npx supabase status -o env`. Use the local publishable key for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the local service-role JWT for `SUPABASE_SERVICE_ROLE_KEY`. Set `ANALYZER_MODE=dummy` for the lightweight local analyzer, or configure the separate Python service before using `ANALYZER_MODE=research`.

```bash
npm run dev
```

The app runs at `http://localhost:3000`; Supabase Studio runs at `http://127.0.0.1:54323`, and local email is visible at `http://127.0.0.1:54324`.

See the [complete setup guide](docs/SETUP.md) for prerequisites, every environment variable, research-service setup, demo data, verification, and troubleshooting.

Google OAuth is rendered only when `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` and the corresponding Supabase provider credentials are configured. Hosted demos without those third-party credentials use the complete email/password flow without exposing an inert OAuth control.

## Synthetic demo

The demo seed is explicit and hard-blocked in production. It creates one account with five clearly labeled synthetic sessions and no recordings.

```bash
SOUNDCUE_ALLOW_DEMO_SEED=true \
SOUNDCUE_DEMO_EMAIL=demo@example.test \
SOUNDCUE_DEMO_PASSWORD='choose-a-local-password' \
npx tsx --env-file=.env.local scripts/seed-demo.ts
```

No hosted demo credentials are committed; the credentials referenced by automated tests are local-only fixtures. Normal accounts always start with empty history.

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

## Architecture

SoundCue is split across three trust zones: the browser captures and reviews audio, the Next.js server authenticates and owns screening lifecycle mutations, and the private inference service performs model work behind an HMAC-authenticated server-to-server boundary. Supabase provides authentication, Postgres/RLS, and private object storage.

The full [architecture diagram](docs/ARCHITECTURE.md) identifies deployment units, data stores, trust boundaries, and the public versus service-role-only result fields.

## How it works

At a high level, a screening follows this path:

1. The user accepts the current consent document and authenticates.
2. The browser records a five-to-seven-second sustained vowel, extracts local quality features, and permits upload only after the local checks pass.
3. Authenticated Route Handlers create the screening row and save the audio to private Supabase Storage.
4. The analysis handler atomically claims the screening, downloads the retained audio, and calls the configured analyzer.
5. In research mode, the web server hashes and HMAC-signs the raw audio request. The Python service verifies it, standardizes and quality-checks the recording, extracts three frozen encoder views, combines each with age, and returns a versioned categorical result.
6. Numerical model outputs are stored in a service-role-only table. The user-facing screening record contains the category, reviewed observations, provenance versions, and no research score.
7. Results, history, playback, deletion, and clinician PDFs are served only after authentication and ownership checks.

Read [How SoundCue works](docs/HOW_IT_WORKS.md) for the request sequence, state machine, inference pipeline, result shaping, failure handling, and deletion behavior.

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
2. Pass the Vercel memory and latency gates on the configured instance (warm p95 under 25 seconds, cold p95 under 75 seconds, all requests under 120 seconds).
3. Complete clinical, legal, privacy, security, and applicable regulatory review, including clinician approval of result/report wording.
4. Receive counsel approval for consent, Privacy, Terms, Accessibility, contact details, and retention/deletion content.
5. Configure production Supabase redirect URLs, Google OAuth, CAPTCHA, custom SMTP, backups, a private US-region project, and the database-backed screening limit.
6. Configure separate Vercel web/inference projects and server-only secrets; platform settings alone do not establish HIPAA compliance.
7. Pass cross-browser, accessibility, RLS/storage isolation, HMAC/replay, PDF, visual-regression, load, incident-response, and deletion-recovery acceptance checks.

SoundCue does not claim HIPAA compliance.
