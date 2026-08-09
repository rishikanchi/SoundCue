# SoundCue research inference service

This private Python service performs SoundCue's three-component sustained-vowel research analysis. It is not a diagnostic model and has not been independently validated. The deployed model uses age plus three frozen encoder views:

- AST layer 3 distillation token: 40%
- AST layer 6 summary: 40%
- WavLM layer 1 mean: 20%

The canonical source for model versions, hashes, category thresholds, quality limits, and reportable validation evidence is [`model_manifest.json`](model_manifest.json). Do not duplicate those values in application copy.

## Build provenance

The checked-in 229 KB sklearn artifact is refitted from the supplied development feature archives after verifying the original four-component bundle has SHA-256 `7610af05ece276bf8a59eb6bae96f162074f1c1d6f54d63591cf36aaaff41c7f`. The unreproducible workbook component is omitted. Sex is absent from every production feature schema and fitted pipeline.

Rebuild from the trusted local research project:

```bash
python scripts/model/build_research_bundle.py \
  --source-project /path/to/Parkinsons_Classification_2 \
  --data-dir /path/to/Parkinsons_Classification/data \
  --canonical-wavlm-features /tmp/soundcue-wavlm-canonical-v1.npz
python scripts/model/validate_research_artifact.py
```

First produce the canonical WavLM archive with `scripts/model/extract_canonical_wavlm.py`. This deliberately replaces the supplied WavLM archive, whose variable two-recording batch padding made shorter-recording features depend on their batch partner. The canonical extractor pads each recording independently to 7.5 seconds, matching production. The development archive is a temporary build input and is not committed because it contains research sample identifiers.

The build reruns age-only three-component LOPO, 20 repeated five-fold evaluations, 20,000 participant bootstraps, age/audio ablations, subgroup checks, and deterministic observation-reference extraction. Use scikit-learn 1.9.0 when rebuilding so the artifact matches the pinned runtime.

## Private API

`POST /v1/analyze` accepts raw browser-audio bytes. Required headers:

```text
Content-Type: audio/webm;codecs=opus
X-SoundCue-Timestamp: <unix seconds>
X-SoundCue-Request-Id: <unique opaque ID>
X-SoundCue-Age: <integer 18 through 85>
X-Content-SHA256: <lowercase hex SHA-256 of the exact body>
X-SoundCue-Signature: <lowercase hex HMAC-SHA256>
```

The HMAC message is the exact UTF-8 sequence below. MIME whitespace is removed and the MIME and digest are lowercased before signing.

```text
v1\n{timestamp}\n{requestId}\n{age}\n{normalizedMimeType}\n{bodySha256}
```

Requests older or newer than five minutes, tampered bodies, reused request IDs on the same warm instance, noncanonical ages, unsupported audio, and bodies over 4 MB are rejected. Durable idempotency remains the calling web server's responsibility because Vercel instances do not share process memory.

Successful responses are `ResearchAnalysisResult` objects. Internal scores and component scores cross only this authenticated server-to-server boundary and must never be sent to the browser or shown as probabilities. Quality failures return HTTP 422 with reviewed reason codes and do not run an encoder.

## Local verification

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
python scripts/download_encoders.py
pytest
ruff check .
uvicorn soundcue_inference.api:app --port 8001
```

Set `SOUNDCUE_INFERENCE_HMAC_SECRET` to at least 32 random bytes and set `SOUNDCUE_EXPECTED_MODEL_SHA256` to the manifest's approved artifact hash. The service verifies the artifact before deserialization and fails closed if configuration, model version, or hash does not match.

## Deployment gate

The included Vercel configuration defines a 120-second `api/index.py` function and downloads the exact pinned encoder revisions during build. The build materializes a purpose-pruned AST encoder through layer 6 and WavLM encoder through layer 1, writes them to `.runtime-models/`, and removes the full source checkpoints. Runtime loading is `local_files_only`; a cold request never downloads model weights. The pruned views are numerically identical to the corresponding layers in the pinned full encoders.

This depends on Vercel's 5 GB Large Functions public beta. The pruned encoder weights are about 229 MB, while Torch and the remaining Python runtime keep the complete function above the standard Python bundle limit. Large Functions also lack Secure Compute support at the time of this implementation, so beta availability, build duration, bundle size, and network-isolation requirements remain explicit launch risks. The production artifact must prove warm p95 under 25 seconds, cold p95 under 75 seconds, no memory failures, and no request beyond the platform timeout on its configured instance. Process-local replay protection is defense in depth; the web application also enforces durable request idempotency and rate limits.
