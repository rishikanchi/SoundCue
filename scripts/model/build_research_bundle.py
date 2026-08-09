#!/usr/bin/env python
"""Build the reproducible, sex-free SoundCue three-component research bundle.

This script trusts one explicitly hashed source artifact, validates its component
contract, then refits the reproducible AST/WavLM estimator families with age as
the only demographic input. It writes a small sklearn bundle and one canonical
JSON manifest; encoder weights are pinned separately by Hugging Face revision.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from hashlib import sha256
import json
from pathlib import Path
import sys
from typing import Any

import joblib
import numpy as np
import pandas as pd
import soundfile as sf
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import maximum_bipartite_matching
from sklearn.base import clone
from sklearn.feature_selection import SelectKBest, VarianceThreshold, f_classif
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, roc_auc_score
from sklearn.model_selection import LeaveOneOut, StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "model-service"))

from soundcue_inference.audio import technical_metrics  # noqa: E402


SOURCE_ARTIFACT_SHA256 = "7610af05ece276bf8a59eb6bae96f162074f1c1d6f54d63591cf36aaaff41c7f"
MODEL_VERSION = "soundcue-research-3c-age-v1.0.0"
PREPROCESSING_VERSION = "audio-8k-to-16k-v1"
BAND_POLICY_VERSION = "development-tertiles-v1"
WEIGHTS = np.asarray([0.4, 0.4, 0.2], dtype=float)
SEED = 260_808


@dataclass(frozen=True)
class ModelSpec:
    code: str
    name: str
    features: np.ndarray
    feature_names: list[str]
    estimator: Any
    method: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-project", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument(
        "--canonical-wavlm-features",
        type=Path,
        required=True,
        help="NPZ produced by extract_canonical_wavlm.py; the batch-dependent source archive is rejected",
    )
    parser.add_argument(
        "--artifact-output",
        type=Path,
        default=REPO_ROOT / "model-service" / "artifacts" / "research_ensemble.joblib",
    )
    parser.add_argument(
        "--manifest-output",
        type=Path,
        default=REPO_ROOT / "model-service" / "model_manifest.json",
    )
    parser.add_argument("--repeats", type=int, default=20)
    parser.add_argument("--bootstrap-draws", type=int, default=20_000)
    return parser.parse_args()


def file_sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_source_bundle(path: Path) -> dict:
    actual_hash = file_sha256(path)
    if actual_hash != SOURCE_ARTIFACT_SHA256:
        raise ValueError(f"Unexpected source bundle hash: {actual_hash}")
    bundle = joblib.load(path)
    names = [component["name"] for component in bundle["components"]]
    expected = [
        "AST layer 3 + demographics",
        "AST layer 6 + demographics",
        "Provided acoustic + demographics",
        "WavLM + demographics",
    ]
    if bundle.get("format_version") != 1 or names != expected:
        raise ValueError("The trusted source bundle does not match its reviewed component contract")
    return bundle


def load_development_data(
    source_project: Path, canonical_wavlm_path: Path
) -> tuple[pd.DataFrame, np.ndarray, np.ndarray]:
    details = pd.read_csv(source_project / "artifacts/results/participant_predictions.csv")
    if len(details) != 81 or details["Sample"].nunique() != 81:
        raise ValueError("Expected 81 unique development participants")
    samples = details["Sample"].astype(str).tolist()

    def ordered_features(name: str) -> np.ndarray:
        archive = np.load(source_project / "artifacts/features" / name)
        lookup = {str(sample): index for index, sample in enumerate(archive["samples"])}
        if set(samples) - set(lookup):
            raise ValueError(f"{name} is missing development samples")
        return archive["features"][[lookup[sample] for sample in samples]]

    canonical = np.load(canonical_wavlm_path)
    if str(canonical["preprocessing_version"]) != "wavlm-fixed-7.5s-padding-v1":
        raise ValueError("Canonical WavLM archive has the wrong preprocessing version")
    lookup = {str(sample): index for index, sample in enumerate(canonical["samples"])}
    if set(samples) - set(lookup):
        raise ValueError("Canonical WavLM archive is missing development samples")
    wavlm = canonical["features"][[lookup[sample] for sample in samples]]
    if wavlm.shape != (81, 768):
        raise ValueError(f"Expected canonical WavLM shape (81, 768), received {wavlm.shape}")
    return details, ordered_features("ast_audioset.npz"), wavlm


def make_specs(
    age: np.ndarray, ast: np.ndarray, wavlm: np.ndarray, *, include_age: bool
) -> list[ModelSpec]:
    prefix = age[:, None] if include_age else np.empty((len(age), 0))
    names = ["Age"] if include_age else []
    ast_l3 = ast[:, 3, 2304:3072]
    ast_l6 = ast[:, 6, :]
    wavlm_l1 = wavlm
    return [
        ModelSpec(
            "ast_layer_3",
            "AST layer 3 + age" if include_age else "AST layer 3 audio only",
            np.c_[prefix, ast_l3],
            names + [f"AST_L3_dist_{index:04d}" for index in range(ast_l3.shape[1])],
            make_pipeline(
                VarianceThreshold(),
                StandardScaler(),
                SelectKBest(f_classif, k=20),
                LogisticRegression(C=10, max_iter=5_000, class_weight="balanced"),
            ),
            "predict_proba",
        ),
        ModelSpec(
            "ast_layer_6",
            "AST layer 6 + age" if include_age else "AST layer 6 audio only",
            np.c_[prefix, ast_l6],
            names + [f"AST_L6_summary_{index:04d}" for index in range(ast_l6.shape[1])],
            make_pipeline(
                VarianceThreshold(),
                StandardScaler(),
                SelectKBest(f_classif, k=40),
                SVC(C=3, gamma="scale", class_weight="balanced"),
            ),
            "decision_function",
        ),
        ModelSpec(
            "wavlm_layer_1",
            "WavLM layer 1 + age" if include_age else "WavLM layer 1 audio only",
            np.c_[prefix, wavlm_l1],
            names + [f"WavLM_L1_mean_{index:04d}" for index in range(wavlm_l1.shape[1])],
            make_pipeline(
                StandardScaler(),
                SelectKBest(f_classif, k=3),
                LogisticRegression(C=0.3, max_iter=5_000, class_weight="balanced"),
            ),
            "predict_proba",
        ),
    ]


def positive_score(estimator: Any, method: str, features: np.ndarray) -> np.ndarray:
    score = getattr(estimator, method)(features)
    return score[:, 1] if score.ndim == 2 else score


def empirical_cdf(value: float, reference: np.ndarray) -> float:
    return float(
        (np.sum(reference < value) + 0.5 * np.sum(reference == value) + 0.5)
        / (len(reference) + 1)
    )


def calibrated_predictions(
    specs: list[ModelSpec],
    y: np.ndarray,
    splits: list[tuple[np.ndarray, np.ndarray]],
    *,
    seed: int,
) -> np.ndarray:
    predictions = np.zeros((len(y), len(specs)), dtype=float)
    for outer_index, (train, test) in enumerate(splits):
        inner = StratifiedKFold(n_splits=5, shuffle=True, random_state=seed + outer_index)
        for component_index, spec in enumerate(specs):
            reference = cross_val_predict(
                clone(spec.estimator),
                spec.features[train],
                y[train],
                cv=inner,
                method=spec.method,
                n_jobs=-1,
            )
            if reference.ndim == 2:
                reference = reference[:, 1]
            fitted = clone(spec.estimator).fit(spec.features[train], y[train])
            raw = positive_score(fitted, spec.method, spec.features[test])
            predictions[test, component_index] = [
                empirical_cdf(value, reference) for value in raw
            ]
    return predictions


def ensemble_predictions(
    specs: list[ModelSpec], y: np.ndarray, splits: list[tuple[np.ndarray, np.ndarray]], *, seed: int
) -> tuple[np.ndarray, np.ndarray]:
    component_scores = calibrated_predictions(specs, y, splits, seed=seed)
    return component_scores @ WEIGHTS, component_scores


def bootstrap_auc(y: np.ndarray, score: np.ndarray, *, draws: int) -> list[float]:
    rng = np.random.default_rng(SEED)
    negative = np.flatnonzero(y == 0)
    positive = np.flatnonzero(y == 1)
    values = np.empty(draws)
    for index in range(draws):
        sample = np.r_[
            rng.choice(negative, len(negative), replace=True),
            rng.choice(positive, len(positive), replace=True),
        ]
        values[index] = roc_auc_score(y[sample], score[sample])
    return np.quantile(values, [0.025, 0.5, 0.975]).tolist()


def classification_metrics(y: np.ndarray, score: np.ndarray) -> dict[str, float | int]:
    prediction = (score >= 0.5).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, prediction).ravel()
    return {
        "scoreCutPoint": 0.5,
        "accuracy": float(accuracy_score(y, prediction)),
        "sensitivity": float(tp / (tp + fn)),
        "specificity": float(tn / (tn + fp)),
        "trueNegative": int(tn),
        "falsePositive": int(fp),
        "falseNegative": int(fn),
        "truePositive": int(tp),
    }


def repeated_five_fold(specs: list[ModelSpec], y: np.ndarray, repeats: int) -> list[float]:
    values = []
    for repeat in range(repeats):
        folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=1_000 + repeat)
        score, _ = ensemble_predictions(
            specs,
            y,
            list(folds.split(np.zeros(len(y)), y)),
            seed=5_000 + repeat * 10,
        )
        values.append(float(roc_auc_score(y, score)))
    return values


def age_only_auc(age: np.ndarray, y: np.ndarray) -> float:
    spec = ModelSpec(
        "age_only",
        "Age only",
        age[:, None],
        ["Age"],
        make_pipeline(StandardScaler(), LogisticRegression(C=0.1, max_iter=5_000)),
        "predict_proba",
    )
    scores = calibrated_predictions(
        [spec], y, list(LeaveOneOut().split(np.zeros(len(y)), y)), seed=SEED
    )[:, 0]
    return float(roc_auc_score(y, scores))


def matched_subset_auc(details: pd.DataFrame, scores: np.ndarray) -> dict[str, float | int]:
    controls = details.index[details["y"] == 0].to_numpy()
    cases = details.index[details["y"] == 1].to_numpy()
    adjacency = np.zeros((len(controls), len(cases)), dtype=int)
    for row, control in enumerate(controls):
        for column, case in enumerate(cases):
            if (
                details.loc[control, "Sex"] == details.loc[case, "Sex"]
                and abs(details.loc[control, "Age"] - details.loc[case, "Age"]) <= 5
            ):
                adjacency[row, column] = 1
    matching = maximum_bipartite_matching(csr_matrix(adjacency), perm_type="column")
    indices = np.asarray(
        [index for row, column in enumerate(matching) if column >= 0 for index in (controls[row], cases[column])]
    )
    return {"participants": int(len(indices)), "auc": float(roc_auc_score(details.loc[indices, "y"], scores[indices]))}


def age_subgroups(details: pd.DataFrame, scores: np.ndarray) -> list[dict]:
    groups = [("18-59", 18, 60), ("60-69", 60, 70), ("70+", 70, float("inf"))]
    output = []
    for label, low, high in groups:
        indices = details.index[(details["Age"] >= low) & (details["Age"] < high)].to_numpy()
        labels = details.loc[indices, "y"].to_numpy()
        output.append(
            {
                "label": label,
                "participants": int(len(indices)),
                "hc": int(np.sum(labels == 0)),
                "pd": int(np.sum(labels == 1)),
                "auc": float(roc_auc_score(labels, scores[indices])) if len(np.unique(labels)) == 2 else None,
            }
        )
    return output


def observation_references(data_dir: Path, details: pd.DataFrame) -> dict:
    audio = {path.stem: path for path in data_dir.glob("*_AH/*.wav")}
    rows = []
    for sample in details["Sample"].astype(str):
        path = audio.get(sample)
        if path is None:
            raise ValueError(f"Development recording is missing for {sample}")
        waveform, sample_rate = sf.read(path, dtype="float32", always_2d=False)
        if waveform.ndim > 1:
            waveform = waveform.mean(axis=1)
        if sample_rate != 8000:
            raise ValueError("Development reference recordings must be 8 kHz")
        rows.append(technical_metrics(waveform))

    def reference(key: str) -> dict:
        values = np.asarray([getattr(row, key) for row in rows if getattr(row, key) is not None])
        return {
            "thresholds": [float(value) for value in np.quantile(values, [1 / 3, 2 / 3])],
            "referenceParticipants": int(len(values)),
        }

    return {
        "pitchSemitoneIqr": reference("pitch_semitone_iqr"),
        "loudnessVariationDb": reference("loudness_variation_db"),
        "voicedCoverage": reference("voiced_coverage"),
        "provenance": "Frozen tertiles from deterministic measurements of the 81 development recordings; contextual, not causal model explanations.",
    }


def fit_bundle(specs: list[ModelSpec], y: np.ndarray) -> dict:
    inner = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    components = []
    for spec in specs:
        reference = cross_val_predict(
            clone(spec.estimator), spec.features, y, cv=inner, method=spec.method, n_jobs=-1
        )
        if reference.ndim == 2:
            reference = reference[:, 1]
        components.append(
            {
                "code": spec.code,
                "name": spec.name,
                "feature_names": spec.feature_names,
                "method": spec.method,
                "estimator": clone(spec.estimator).fit(spec.features, y),
                "calibration_reference": np.asarray(reference, dtype=float),
            }
        )
    return {
        "format_version": 2,
        "model_version": MODEL_VERSION,
        "outcome": "HC (0) versus Parkinson's disease (1), research development only",
        "weights": WEIGHTS,
        "components": components,
        "source_artifact_sha256": SOURCE_ARTIFACT_SHA256,
        "sex_input_included": False,
    }


def main() -> None:
    args = parse_args()
    source_project = args.source_project.resolve()
    data_dir = args.data_dir.resolve()
    source_artifact = source_project / "artifacts/models/final_ensemble.joblib"
    validate_source_bundle(source_artifact)
    details, ast, wavlm = load_development_data(
        source_project, args.canonical_wavlm_features.resolve()
    )
    age = details["Age"].to_numpy(dtype=float)
    y = details["y"].to_numpy(dtype=int)
    specs = make_specs(age, ast, wavlm, include_age=True)
    splits = list(LeaveOneOut().split(np.zeros(len(y)), y))
    score, component_scores = ensemble_predictions(specs, y, splits, seed=SEED)
    audio_specs = make_specs(age, ast, wavlm, include_age=False)
    audio_score, _ = ensemble_predictions(audio_specs, y, splits, seed=SEED)
    repeated = repeated_five_fold(specs, y, args.repeats)
    band_thresholds = [float(value) for value in np.quantile(score, [1 / 3, 2 / 3])]
    bands = np.select(
        [score < band_thresholds[0], score < band_thresholds[1]],
        ["fewer", "some"],
        default="more",
    )

    bundle = fit_bundle(specs, y)
    args.artifact_output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, args.artifact_output, compress=3)
    artifact_hash = file_sha256(args.artifact_output)
    component_auc = {
        spec.code: float(roc_auc_score(y, component_scores[:, index]))
        for index, spec in enumerate(specs)
    }
    ci_low, ci_median, ci_high = bootstrap_auc(y, score, draws=args.bootstrap_draws)
    manifest = {
        "schemaVersion": 1,
        "model": {
            "kind": "research",
            "version": MODEL_VERSION,
            "artifact": {
                "path": "artifacts/research_ensemble.joblib",
                "sha256": artifact_hash,
                "sourceArtifactSha256": SOURCE_ARTIFACT_SHA256,
            },
            "developmentAssets": {
                "participantTableSha256": file_sha256(
                    source_project / "artifacts/results/participant_predictions.csv"
                ),
                "astFeatureArchiveSha256": file_sha256(
                    source_project / "artifacts/features/ast_audioset.npz"
                ),
                "canonicalWavlmArchiveSha256": file_sha256(
                    args.canonical_wavlm_features.resolve()
                ),
            },
            "components": [
                {"code": spec.code, "name": spec.name, "weight": float(WEIGHTS[index])}
                for index, spec in enumerate(specs)
            ],
            "inputs": {"audio": True, "ageYears": True, "sex": False},
            "ageRangeYears": {"minimum": 18, "maximum": 85},
            "encoderRevisions": {
                "ast": {
                    "modelId": "MIT/ast-finetuned-audioset-10-10-0.4593",
                    "revision": "f826b80d28226b62986cc218e5cec390b1096902",
                },
                "wavlm": {
                    "modelId": "microsoft/wavlm-base-plus",
                    "revision": "4c66d4806a428f2e922ccfa1a962776e232d487b",
                },
            },
        },
        "preprocessing": {
            "version": PREPROCESSING_VERSION,
            "decode": {"channels": 1, "sampleRateHz": 8000, "sampleFormat": "float32"},
            "encoderInput": {
                "sampleRateHz": 16000,
                "resampler": "librosa-0.11.0-default-soxr_hq",
            },
            "astFeatures": {
                "layer3": "distillation token (768)",
                "layer6": "token mean, token standard deviation, CLS token, distillation token (3072)",
            },
            "wavlmFeatures": {
                "layer1": "valid-frame mean (768)",
                "padding": "Per-recording fixed 120000-sample (7.5 second) encoder input",
                "archiveSha256": file_sha256(args.canonical_wavlm_features.resolve()),
            },
            "parity": {
                "requiredParticipants": 81,
                "passed": False,
                "status": "pending_all_participant_validation",
                "suppliedWavlmArchive": {
                    "passed": False,
                    "maximumAbsoluteErrorObserved": 0.3133498430252075,
                    "reason": "Variable two-recording batch padding made a shorter recording depend on its batch partner.",
                },
                "canonicalWavlm": {
                    "version": "wavlm-fixed-7.5s-padding-v1",
                    "archiveSha256": file_sha256(args.canonical_wavlm_features.resolve()),
                    "passed": False,
                    "participantsValidated": 0,
                    "absoluteTolerance": 0.0001,
                    "maximumAbsoluteError": None,
                },
            },
        },
        "bandPolicy": {
            "version": BAND_POLICY_VERSION,
            "method": "Frozen tertiles of age-only three-component LOPO development scores",
            "thresholds": band_thresholds,
            "labels": ["fewer", "some", "more"],
            "developmentCounts": {
                label: int(np.sum(bands == label)) for label in ("fewer", "some", "more")
            },
            "isProbability": False,
        },
        "observationReferences": observation_references(data_dir, details),
        "validation": {
            "evidenceKind": "preliminary_internal_development",
            "developmentCohort": {
                "participants": 81,
                "hc": 41,
                "pd": 40,
                "ageMinimum": float(age.min()),
                "ageMaximum": float(age.max()),
                "hcMedianAge": float(details.loc[details["y"] == 0, "Age"].median()),
                "pdMedianAge": float(details.loc[details["y"] == 1, "Age"].median()),
            },
            "primary": {
                "method": "Leave-one-participant-out with fold-local five-fold empirical-CDF calibration",
                "rocAuc": float(roc_auc_score(y, score)),
            },
            "bootstrap95": {
                "method": f"Class-stratified participant bootstrap, {args.bootstrap_draws} draws",
                "low": float(ci_low),
                "median": float(ci_median),
                "high": float(ci_high),
            },
            "thresholdAtPoint5": classification_metrics(y, score),
            "repeatedFiveFold": {
                "repeats": args.repeats,
                "meanRocAuc": float(np.mean(repeated)),
                "standardDeviation": float(np.std(repeated)),
                "minimum": float(np.min(repeated)),
                "maximum": float(np.max(repeated)),
                "values": repeated,
            },
            "ablations": {
                "ageOnlyRocAuc": age_only_auc(age, y),
                "audioOnlyThreeComponentRocAuc": float(roc_auc_score(y, audio_score)),
                "componentRocAuc": component_auc,
            },
            "ageSubgroups": age_subgroups(details, score),
            "exactSexAgeWithinFiveYearsMatchedSubset": matched_subset_auc(details, score),
            "limitations": [
                "No external, prospective, site, microphone, or recording-session validation.",
                "Development representation and hyperparameter choices were informed by the same 81-participant dataset.",
                "The development cohorts are substantially age imbalanced; the model explicitly uses age.",
                "Development recordings were 1.516 to 7.208 seconds, while production accepts 5.0 to 7.5 seconds.",
                "Technical observations provide context and are not causal explanations of the encoder-based result.",
                "WavLM development features were re-extracted with fixed per-recording padding because the supplied archive depended on variable batch partners.",
                "This research model must not be used to diagnose Parkinson's disease or guide treatment.",
            ],
        },
        "quality": {
            "minDurationSeconds": 5.0,
            "maxDurationSeconds": 7.5,
            "minRmsDbfs": -40.0,
            "minVoicedCoverage": 0.65,
            "maxClippingRatio": 0.01,
            "maxDiscontinuityRatio": 0.005,
            "maxAudioBytes": 4_194_304,
        },
        "release": {
            "status": "research_only",
            "independentlyValidated": False,
            "diagnosticUse": False,
            "productionFallbackToDummyAllowed": False,
        },
    }
    args.manifest_output.parent.mkdir(parents=True, exist_ok=True)
    args.manifest_output.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"artifactSha256": artifact_hash, "primaryRocAuc": manifest["validation"]["primary"]["rocAuc"], "bandThresholds": band_thresholds}, indent=2))


if __name__ == "__main__":
    main()
