#!/usr/bin/env python
"""Materialize only the encoder layers used by SoundCue inference."""

from __future__ import annotations

import gc
import hashlib
import json
from pathlib import Path
import shutil

from huggingface_hub import snapshot_download
from safetensors.torch import load_file, save_file
import torch


ROOT = Path(__file__).resolve().parents[1]
SOURCE_CACHE = ROOT / ".model-cache"
RUNTIME_ROOT = ROOT / ".runtime-models"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_config(source: Path, destination: Path, *, layers: int, architecture: str) -> None:
    config = json.loads(source.read_text(encoding="utf-8"))
    config["num_hidden_layers"] = layers
    config["architectures"] = [architecture]
    destination.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")


def layer_index(key: str, marker: str) -> int | None:
    if marker not in key:
        return None
    suffix = key.split(marker, 1)[1]
    candidate = suffix.split(".", 1)[0]
    return int(candidate) if candidate.isdigit() else None


def materialize_ast(snapshot: Path, destination: Path) -> dict[str, str | int]:
    source_weights = snapshot / "model.safetensors"
    source_state = load_file(source_weights, device="cpu")
    runtime_state = {}
    prefix = "audio_spectrogram_transformer."
    for key, tensor in source_state.items():
        if not key.startswith(prefix):
            continue
        runtime_key = key.removeprefix(prefix)
        index = layer_index(runtime_key, "encoder.layer.")
        if index is None or index < 6:
            runtime_state[runtime_key] = tensor.contiguous()

    destination.mkdir(parents=True, exist_ok=True)
    runtime_weights = destination / "model.safetensors"
    save_file(runtime_state, runtime_weights, metadata={"format": "pt"})
    write_config(
        snapshot / "config.json",
        destination / "config.json",
        layers=6,
        architecture="ASTModel",
    )
    shutil.copy2(snapshot / "preprocessor_config.json", destination / "preprocessor_config.json")
    return {
        "sourceSha256": sha256(source_weights),
        "runtimeSha256": sha256(runtime_weights),
        "layers": 6,
    }


def materialize_wavlm(snapshot: Path, destination: Path) -> dict[str, str | int]:
    source_weights = snapshot / "pytorch_model.bin"
    source_state = torch.load(source_weights, map_location="cpu", weights_only=True)
    runtime_state = {}
    for key, tensor in source_state.items():
        index = layer_index(key, "encoder.layers.")
        if index is None or index < 1:
            runtime_state[key] = tensor.contiguous()

    destination.mkdir(parents=True, exist_ok=True)
    runtime_weights = destination / "model.safetensors"
    save_file(runtime_state, runtime_weights, metadata={"format": "pt"})
    write_config(
        snapshot / "config.json",
        destination / "config.json",
        layers=1,
        architecture="WavLMModel",
    )
    shutil.copy2(snapshot / "preprocessor_config.json", destination / "preprocessor_config.json")
    return {
        "sourceSha256": sha256(source_weights),
        "runtimeSha256": sha256(runtime_weights),
        "layers": 1,
    }


def main() -> None:
    manifest = json.loads((ROOT / "model_manifest.json").read_text(encoding="utf-8"))
    revisions = manifest["model"]["encoderRevisions"]
    allow_patterns = [
        "config.json",
        "preprocessor_config.json",
        "processor_config.json",
        "*.safetensors",
        "*.bin",
    ]
    snapshots = {
        code: Path(
            snapshot_download(
                encoder["modelId"],
                revision=encoder["revision"],
                cache_dir=SOURCE_CACHE,
                allow_patterns=allow_patterns,
            )
        )
        for code, encoder in revisions.items()
    }

    if RUNTIME_ROOT.exists():
        shutil.rmtree(RUNTIME_ROOT)
    evidence = {
        "schemaVersion": 1,
        "ast": materialize_ast(snapshots["ast"], RUNTIME_ROOT / "ast"),
        "wavlm": materialize_wavlm(snapshots["wavlm"], RUNTIME_ROOT / "wavlm"),
    }
    (RUNTIME_ROOT / "runtime_manifest.json").write_text(
        json.dumps(evidence, indent=2) + "\n", encoding="utf-8"
    )
    del snapshots
    gc.collect()
    if SOURCE_CACHE.exists():
        shutil.rmtree(SOURCE_CACHE)
    print("Purpose-pruned pinned encoders are available in .runtime-models")


if __name__ == "__main__":
    main()
