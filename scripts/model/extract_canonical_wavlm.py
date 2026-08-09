#!/usr/bin/env python
"""Extract per-recording WavLM features with a frozen padding contract.

The original research archive used variable two-recording batch padding, which
made a shorter recording's representation depend on its batch partner. This
extractor pads every recording independently to 7.5 seconds so development and
production features have the same reproducible definition.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import librosa
import numpy as np
import pandas as pd
import soundfile as sf
import torch
from transformers import AutoFeatureExtractor, AutoModel


REPO_ROOT = Path(__file__).resolve().parents[2]
MAX_LENGTH_16KHZ = 120_000


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-project", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--local-files-only", action="store_true")
    args = parser.parse_args()

    manifest = json.loads(
        (REPO_ROOT / "model-service/model_manifest.json").read_text(encoding="utf-8")
    )
    encoder = manifest["model"]["encoderRevisions"]["wavlm"]
    common = {
        "revision": encoder["revision"],
        "local_files_only": args.local_files_only,
    }
    if args.cache_dir:
        common["cache_dir"] = str(args.cache_dir)
    processor = AutoFeatureExtractor.from_pretrained(encoder["modelId"], **common)
    model = AutoModel.from_pretrained(encoder["modelId"], **common).eval()
    details = pd.read_csv(args.source_project / "artifacts/results/participant_predictions.csv")
    samples = details["Sample"].astype(str).tolist()
    audio = {path.stem: path for path in args.data_dir.glob("*_AH/*.wav")}
    rows = []
    for index, sample in enumerate(samples, start=1):
        waveform, sample_rate = sf.read(audio[sample], dtype="float32", always_2d=False)
        if waveform.ndim > 1:
            waveform = waveform.mean(axis=1)
        if sample_rate != 8000:
            raise ValueError(f"{sample} is not 8 kHz")
        waveform = librosa.resample(waveform, orig_sr=8000, target_sr=16000).astype(
            np.float32
        )
        inputs = processor(
            [waveform],
            sampling_rate=16000,
            padding="max_length",
            max_length=MAX_LENGTH_16KHZ,
            truncation=True,
            return_attention_mask=True,
            return_tensors="pt",
        )
        with torch.inference_mode():
            output = model(
                input_values=inputs["input_values"],
                attention_mask=inputs["attention_mask"],
                output_hidden_states=True,
            )
        frame_length = int(
            model._get_feat_extract_output_lengths(inputs["attention_mask"].sum(dim=1))[0]
        )
        rows.append(
            output.hidden_states[1][0, :frame_length]
            .float()
            .mean(dim=0)
            .cpu()
            .numpy()
            .astype(np.float32)
        )
        print(f"Extracted {index}/{len(samples)}", flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.output,
        samples=np.asarray(samples),
        features=np.stack(rows),
        model_id=np.asarray(encoder["modelId"]),
        revision=np.asarray(encoder["revision"]),
        preprocessing_version=np.asarray("wavlm-fixed-7.5s-padding-v1"),
        max_length_16khz=np.asarray(MAX_LENGTH_16KHZ),
    )
    print(f"Saved {len(samples)} canonical WavLM rows to {args.output}")


if __name__ == "__main__":
    main()

