import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ModelEvidence } from "./report-model";
import { parseModelEvidence } from "./model-evidence-parser";

export async function loadModelEvidence(): Promise<ModelEvidence> {
  const manifestPath = path.join(process.cwd(), "model-service", "model_manifest.json");
  try {
    return parseModelEvidence(JSON.parse(await readFile(manifestPath, "utf8")));
  } catch {
    return {
      modelVersion: null,
      artifactSha256: null,
      participants: null,
      metrics: [],
      limitations: [],
    };
  }
}
