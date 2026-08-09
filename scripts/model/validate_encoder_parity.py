#!/usr/bin/env python
"""Compare production extraction with all saved development encoder features."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import numpy as np
import soundfile as sf


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "model-service"))

from soundcue_inference.model import EncoderExtractor  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-project", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--canonical-wavlm-features", type=Path, required=True)
    parser.add_argument("--atol", type=float, default=1e-4)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--update-manifest", action="store_true")
    args = parser.parse_args()

    manifest = json.loads(
        (REPO_ROOT / "model-service/model_manifest.json").read_text(encoding="utf-8")
    )
    ast = np.load(args.source_project / "artifacts/features/ast_audioset.npz")
    wavlm = np.load(args.canonical_wavlm_features)
    ast_lookup = {str(sample): index for index, sample in enumerate(ast["samples"])}
    wavlm_lookup = {str(sample): index for index, sample in enumerate(wavlm["samples"])}
    samples = [str(sample) for sample in ast["samples"]]
    if args.limit:
        samples = samples[: args.limit]
    audio = {path.stem: path for path in args.data_dir.glob("*_AH/*.wav")}
    extractor = EncoderExtractor(manifest, args.cache_dir)
    maximum_error = {"ast_layer_3": 0.0, "ast_layer_6": 0.0, "wavlm_layer_1": 0.0}

    for number, sample in enumerate(samples, start=1):
        waveform, sample_rate = sf.read(audio[sample], dtype="float32", always_2d=False)
        if waveform.ndim > 1:
            waveform = waveform.mean(axis=1)
        if sample_rate != 8000:
            raise ValueError(f"{sample} is not 8 kHz")
        actual = extractor.extract(waveform)
        expected = {
            "ast_layer_3": ast["features"][ast_lookup[sample], 3, 2304:3072],
            "ast_layer_6": ast["features"][ast_lookup[sample], 6, :],
            "wavlm_layer_1": wavlm["features"][wavlm_lookup[sample]],
        }
        for code in expected:
            error = float(np.max(np.abs(actual[code] - expected[code])))
            maximum_error[code] = max(maximum_error[code], error)
            if not np.allclose(actual[code], expected[code], atol=args.atol, rtol=1e-5):
                raise SystemExit(f"Parity failed for {sample}/{code}: max error {error}")
        print(f"Verified {number}/{len(samples)}", flush=True)
    receipt = {"participants": len(samples), "maximumAbsoluteError": maximum_error}
    if args.update_manifest:
        if len(samples) != 81:
            raise SystemExit("Refusing to mark parity passed without all 81 participants")
        parity = manifest["preprocessing"]["parity"]
        parity["passed"] = True
        parity["status"] = "passed"
        parity["canonicalWavlm"].update(
            {
                "passed": True,
                "participantsValidated": 81,
                "maximumAbsoluteError": max(maximum_error.values()),
                "perComponentMaximumAbsoluteError": maximum_error,
            }
        )
        manifest_path = REPO_ROOT / "model-service/model_manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        receipt["manifestUpdated"] = str(manifest_path)
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
