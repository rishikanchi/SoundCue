#!/usr/bin/env python
"""Fail-fast validation of the checked-in research artifact and manifest."""

from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path

import joblib
import numpy as np


REPO_ROOT = Path(__file__).resolve().parents[2]


def digest(path: Path) -> str:
    value = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--manifest", type=Path, default=REPO_ROOT / "model-service/model_manifest.json"
    )
    parser.add_argument(
        "--artifact",
        type=Path,
        default=REPO_ROOT / "model-service/artifacts/research_ensemble.joblib",
    )
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    actual = digest(args.artifact)
    expected = manifest["model"]["artifact"]["sha256"]
    if actual != expected:
        raise SystemExit(f"Artifact hash mismatch: expected {expected}, received {actual}")
    bundle = joblib.load(args.artifact)
    if bundle["model_version"] != manifest["model"]["version"]:
        raise SystemExit("Model version does not match the manifest")
    if not np.allclose(bundle["weights"], [0.4, 0.4, 0.2]):
        raise SystemExit("Unexpected component weights")
    if [component["code"] for component in bundle["components"]] != [
        "ast_layer_3",
        "ast_layer_6",
        "wavlm_layer_1",
    ]:
        raise SystemExit("Unexpected component order")
    names = {name for item in bundle["components"] for name in item["feature_names"]}
    if "Sex_M" in names or any("sex" in name.lower() for name in names):
        raise SystemExit("Sex remains in the model input schema")
    for component in bundle["components"]:
        if len(component["calibration_reference"]) != 81:
            raise SystemExit("Calibration reference must contain 81 fold-local scores")
    print(f"Validated {bundle['model_version']} ({actual})")


if __name__ == "__main__":
    main()
