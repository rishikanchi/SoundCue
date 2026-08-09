import type { ModelEvidence, ModelEvidenceMetric } from "./report-model";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function valueAt(root: UnknownRecord, paths: string[][]): unknown {
  for (const segments of paths) {
    let value: unknown = root;
    for (const segment of segments) {
      const current = record(value);
      value = current?.[segment];
    }
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function numberAt(root: UnknownRecord, paths: string[][]): number | null {
  const value = valueAt(root, paths);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringAt(root: UnknownRecord, paths: string[][]): string | null {
  const value = valueAt(root, paths);
  return typeof value === "string" && value.trim() ? value : null;
}

function formatAuc(value: number) {
  return value.toFixed(4);
}

function formatPercent(value: number) {
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(1)}%`;
}

export function parseModelEvidence(input: unknown): ModelEvidence {
  const root = record(input);
  if (!root) {
    return {
      modelVersion: null,
      artifactSha256: null,
      participants: null,
      metrics: [],
      limitations: [],
    };
  }

  const modelVersion = stringAt(root, [
    ["model_version"],
    ["modelVersion"],
    ["model", "version"],
  ]);
  const artifactSha256 = stringAt(root, [
    ["model", "artifact", "sha256"],
    ["model_artifact_sha256"],
    ["modelArtifactSha256"],
  ]);
  const participants = numberAt(root, [
    ["validation", "developmentCohort", "participants"],
    ["validation", "participants"],
    ["validation", "participant_count"],
    ["development_data", "participants"],
  ]);
  const lopoAuc = numberAt(root, [
    ["validation", "primary", "rocAuc"],
    ["validation", "lopo_auc"],
    ["validation", "leave_one_participant_out", "roc_auc"],
    ["metrics", "lopo_auc"],
  ]);
  const bootstrapLow = numberAt(root, [
    ["validation", "bootstrap95", "low"],
    ["validation", "bootstrap_95_ci", "lower"],
    ["validation", "lopo_bootstrap_95_ci", "lower"],
    ["metrics", "lopo_auc_ci_95", "lower"],
  ]);
  const bootstrapHigh = numberAt(root, [
    ["validation", "bootstrap95", "high"],
    ["validation", "bootstrap_95_ci", "upper"],
    ["validation", "lopo_bootstrap_95_ci", "upper"],
    ["metrics", "lopo_auc_ci_95", "upper"],
  ]);
  const repeatedAuc = numberAt(root, [
    ["validation", "repeatedFiveFold", "meanRocAuc"],
    ["validation", "repeated_5_fold_mean_auc"],
    ["validation", "repeated_five_fold", "mean_roc_auc"],
    ["metrics", "repeated_5_fold_auc"],
  ]);
  const accuracy = numberAt(root, [
    ["validation", "thresholdAtPoint5", "accuracy"],
    ["validation", "accuracy"],
    ["metrics", "accuracy"],
  ]);
  const sensitivity = numberAt(root, [
    ["validation", "thresholdAtPoint5", "sensitivity"],
    ["validation", "sensitivity"],
    ["metrics", "sensitivity"],
  ]);
  const specificity = numberAt(root, [
    ["validation", "thresholdAtPoint5", "specificity"],
    ["validation", "specificity"],
    ["metrics", "specificity"],
  ]);

  const metrics: ModelEvidenceMetric[] = [];
  if (lopoAuc !== null) {
    metrics.push({
      label: "Leave-one-participant-out ROC AUC",
      value: formatAuc(lopoAuc),
      detail:
        bootstrapLow !== null && bootstrapHigh !== null
          ? `Bootstrap 95% interval ${formatAuc(bootstrapLow)}-${formatAuc(bootstrapHigh)}`
          : undefined,
    });
  }
  if (repeatedAuc !== null) {
    metrics.push({
      label: "Repeated five-fold mean ROC AUC",
      value: formatAuc(repeatedAuc),
    });
  }
  for (const [label, value] of [
    ["Accuracy", accuracy],
    ["Sensitivity", sensitivity],
    ["Specificity", specificity],
  ] as const) {
    if (value !== null) metrics.push({ label, value: formatPercent(value) });
  }

  const limitationsValue = valueAt(root, [["limitations"], ["validation", "limitations"]]);
  const limitations = Array.isArray(limitationsValue)
    ? limitationsValue.filter((item): item is string => typeof item === "string")
    : [];

  return { modelVersion, artifactSha256, participants, metrics, limitations };
}
