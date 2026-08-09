#!/usr/bin/env python
"""Materialize only the pinned encoder files included in the inference function."""

from __future__ import annotations

import json
from pathlib import Path

from huggingface_hub import snapshot_download


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    manifest = json.loads((ROOT / "model_manifest.json").read_text(encoding="utf-8"))
    cache_dir = ROOT / ".model-cache"
    allow_patterns = [
        "config.json",
        "preprocessor_config.json",
        "processor_config.json",
        "*.safetensors",
        "*.bin",
    ]
    for encoder in manifest["model"]["encoderRevisions"].values():
        snapshot_download(
            encoder["modelId"],
            revision=encoder["revision"],
            cache_dir=cache_dir,
            allow_patterns=allow_patterns,
        )
    print("Pinned encoder snapshots are available in .model-cache")


if __name__ == "__main__":
    main()

