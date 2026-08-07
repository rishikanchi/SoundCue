export type DeletionFailureCode =
  | "recording_delete_failed"
  | "screening_delete_failed"
  | "account_delete_failed";

export class DeletionFailure extends Error {
  constructor(public readonly code: DeletionFailureCode) {
    super(code);
    this.name = "DeletionFailure";
  }
}

export async function deleteScreeningResources(options: {
  recordingPath: string | null;
  removeRecording: (path: string) => Promise<void>;
  deleteRow: () => Promise<void>;
}) {
  if (options.recordingPath) {
    try {
      await options.removeRecording(options.recordingPath);
    } catch {
      throw new DeletionFailure("recording_delete_failed");
    }
  }
  try {
    await options.deleteRow();
  } catch {
    throw new DeletionFailure("screening_delete_failed");
  }
}

export async function deleteAccountResources(options: {
  recordingPaths: string[];
  removeRecordings: (paths: string[]) => Promise<void>;
  deleteAuthUser: () => Promise<void>;
  batchSize?: number;
}) {
  const batchSize = options.batchSize ?? 100;
  for (let start = 0; start < options.recordingPaths.length; start += batchSize) {
    try {
      await options.removeRecordings(options.recordingPaths.slice(start, start + batchSize));
    } catch {
      throw new DeletionFailure("recording_delete_failed");
    }
  }
  try {
    await options.deleteAuthUser();
  } catch {
    throw new DeletionFailure("account_delete_failed");
  }
}
