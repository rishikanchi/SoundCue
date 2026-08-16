# SoundCue setup

This guide covers three supported local modes:

1. **UI preview** — no account, database, retained audio, or remote inference.
2. **Full local app with dummy analysis** — local Supabase plus the deterministic development analyzer.
3. **Full research path** — local Supabase plus the separate Python inference service and pinned encoders.

The dummy analyzer and preview result are development aids. They are not research-model results, and production refuses to use them.

## Prerequisites

All modes require:

- Git
- Node.js 20.9 or newer
- npm 10 or newer

The full local app also requires:

- Docker Desktop or another running Docker-compatible daemon
- Supabase CLI 2.x

The research inference service additionally requires:

- Python 3.12 exactly
- Enough disk and memory for PyTorch, Transformers, and the purpose-pruned AST and WavLM weights
- Network access during the one-time encoder download

## 1. Clone and install

```bash
git clone <repository-url>
cd SoundCue
npm ci
```

`npm ci` installs the exact JavaScript dependency graph in `package-lock.json`.

## 2. Choose a local mode

### Option A: UI-only preview

Do not create `.env.local`, or leave the Supabase public variables unset.

```bash
npm run dev
```

Open `http://localhost:3000`. The app detects that Supabase is not configured and enables its non-persistent preview path. Recordings and preview results remain in browser memory/session storage and are not added to account history.

### Option B: Local Supabase with dummy analysis

Start the local Supabase services and apply all migrations:

```bash
npm run supabase:start
npm run supabase:reset
cp .env.example .env.local
```

Inspect the local values without committing them:

```bash
npx supabase status -o env
```

Populate `.env.local` as follows:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false

SUPABASE_SERVICE_ROLE_KEY=<local service-role JWT>

ANALYZER_MODE=dummy

CONSENT_SIGNING_SECRET=<random local secret>
CONSENT_DOCUMENT_VERSION=2026-08-08-research-v1
```

Generate a consent-cookie secret with:

```bash
openssl rand -hex 32
```

Leave all `SOUNDCUE_INFERENCE_*` values blank in dummy mode. Then start the web app:

```bash
npm run dev
```

Local services are available at:

| Service | URL |
| --- | --- |
| Web app | `http://localhost:3000` |
| Supabase API | `http://127.0.0.1:54321` |
| Supabase Studio | `http://127.0.0.1:54323` |
| Local email inbox | `http://127.0.0.1:54324` |

Use the local email inbox to follow confirmation and password-reset links.

### Option C: Full research inference

Complete Option B first. Then create the inference-service environment from the repository root:

```bash
cd model-service
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt
python scripts/download_encoders.py
```

The download script fetches the exact revisions in `model_manifest.json`, removes unused layers, writes the runtime weights to `model-service/.runtime-models/`, and removes its source-model cache.

Read the approved artifact hash from the manifest:

```bash
python -c 'import json; print(json.load(open("model_manifest.json"))["model"]["artifact"]["sha256"])'
```

Generate a separate shared HMAC secret with `openssl rand -hex 32`. Keep that same value on both services.

In the inference-service terminal, set the secret and approved hash, then start FastAPI:

```bash
export SOUNDCUE_INFERENCE_HMAC_SECRET='<shared HMAC secret>'
export SOUNDCUE_EXPECTED_MODEL_SHA256='<artifact SHA-256 from the manifest>'
uvicorn soundcue_inference.api:app --host 127.0.0.1 --port 8001
```

Confirm the service is reachable:

```bash
curl http://127.0.0.1:8001/health
```

The response should be `{"status":"ok"}`. Health does not load the model; the first authenticated analysis request performs the cold load.

Update the web app's `.env.local`:

```dotenv
ANALYZER_MODE=research
SOUNDCUE_INFERENCE_URL=http://127.0.0.1:8001
SOUNDCUE_INFERENCE_HMAC_SECRET=<same shared HMAC secret>
SOUNDCUE_MODEL_ARTIFACT_SHA256=<same artifact SHA-256>
```

Restart `npm run dev` after changing environment variables. The web service accepts HTTP for local development; a production research-service URL must use HTTPS.

## Environment-variable reference

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Supabase project/API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server | Browser-safe Supabase key |
| `NEXT_PUBLIC_SITE_URL` | Browser and server | Canonical app URL and auth redirect base |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | Browser | Shows Google sign-in only when explicitly enabled |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Trusted lifecycle, storage, and deletion operations |
| `ANALYZER_MODE` | Server only | `dummy` locally or `research` for the protected model path |
| `SOUNDCUE_INFERENCE_URL` | Web server only | Base URL of the private inference service |
| `SOUNDCUE_INFERENCE_HMAC_SECRET` | Both trusted services | Authenticates and integrity-protects inference requests |
| `SOUNDCUE_MODEL_ARTIFACT_SHA256` | Web server only | Hash expected in a successful inference response |
| `SOUNDCUE_EXPECTED_MODEL_SHA256` | Inference service only | Hash required before the artifact is deserialized |
| `CONSENT_SIGNING_SECRET` | Web server only | Signs the short-lived pending-consent cookie |
| `CONSENT_DOCUMENT_VERSION` | Web server only | Version stored in append-only consent events |
| `SOUNDCUE_DEMO_*` | Seed script only | Explicit synthetic-demo inputs |

Never expose server-only values through a `NEXT_PUBLIC_` name, and never commit `.env.local`. The repository commits only `.env.example`.

## Optional Google OAuth

Email/password authentication works locally without third-party credentials. To enable Google:

1. Configure the Google provider in Supabase.
2. Add the correct callback and site redirect URLs in both Google and Supabase.
3. Set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`.

The UI intentionally hides the Google control when the flag is false.

## Synthetic demo data

The seed is blocked unless explicitly enabled and always refuses to run in production. With the Supabase variables already present in `.env.local`, run:

```bash
SOUNDCUE_ALLOW_DEMO_SEED=true \
SOUNDCUE_DEMO_EMAIL=demo@example.test \
SOUNDCUE_DEMO_PASSWORD='choose-a-local-password' \
npx tsx --env-file=.env.local scripts/seed-demo.ts
```

This creates one labeled synthetic account with five sessions and no recordings. Re-running the seed refreshes that account's synthetic sessions.

The checked-in end-to-end and visual scripts expect their fixture account:

```bash
SOUNDCUE_ALLOW_DEMO_SEED=true \
SOUNDCUE_DEMO_EMAIL=demo@soundcue.local \
SOUNDCUE_DEMO_PASSWORD='SoundCue-Demo-Only-2026!' \
npx tsx --env-file=.env.local scripts/seed-demo.ts
```

These are local fixture credentials, not hosted demo credentials.

## Verification

Run the fast application checks from the repository root:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Run database policy tests after starting and resetting Supabase:

```bash
npm run supabase:reset
npx supabase test db
```

Install the Playwright browser once, seed the expected fixture account, and run the browser suite:

```bash
npx playwright install chromium
npm run test:e2e
```

The suite records with `tests/fixtures/sustained-ah.wav`; it does not use a person's recording. Use `ANALYZER_MODE=dummy` for the lightweight path, or keep the research service running to cover research reports.

Run the Python checks inside `model-service/` with its virtual environment active:

```bash
pytest
ruff check .
```

## Troubleshooting

- **The app enters preview mode:** verify both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` exist, then restart Next.js.
- **Account APIs fail locally:** verify `SUPABASE_SERVICE_ROLE_KEY` is the local service-role JWT, not the browser publishable key.
- **Analysis is unavailable in dummy mode:** ensure `ANALYZER_MODE=dummy` and that the app is not running with a production environment.
- **Research analysis returns unavailable:** check that both services use the same HMAC secret and artifact hash, that the inference URL includes the correct port, and that `.runtime-models/ast` and `.runtime-models/wavlm` exist.
- **The model service reports a configuration error:** the HMAC secret must contain at least 32 bytes and the expected hash must be 64 lowercase hexadecimal characters.
- **A migration or policy test is stale:** run `npm run supabase:reset` to rebuild the local database from committed migrations.
- **Microphone capture is blocked:** use a secure browser context (`localhost` qualifies), grant microphone permission, and use a supported current browser.

Stop local Supabase when finished:

```bash
npm run supabase:stop
```
