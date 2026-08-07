import { describe, expect, it, vi } from "vitest";
import { deleteAccountResources, deleteScreeningResources, DeletionFailure } from "./deletion";

describe("deletion orchestration", () => {
  it("removes recording storage before the screening row", async () => {
    const events: string[] = [];
    await deleteScreeningResources({
      recordingPath: "user/screening/source.webm",
      removeRecording: async () => { events.push("storage"); },
      deleteRow: async () => { events.push("row"); },
    });
    expect(events).toEqual(["storage", "row"]);
  });

  it("does not delete the row when storage deletion fails", async () => {
    const deleteRow = vi.fn();
    await expect(deleteScreeningResources({
      recordingPath: "user/screening/source.webm",
      removeRecording: async () => { throw new Error("unavailable"); },
      deleteRow,
    })).rejects.toEqual(expect.objectContaining<Partial<DeletionFailure>>({ code: "recording_delete_failed" }));
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it("batches account recordings before deleting the auth user", async () => {
    const batches: string[][] = [];
    const deleteAuthUser = vi.fn(async () => undefined);
    await deleteAccountResources({
      recordingPaths: ["one", "two", "three"],
      batchSize: 2,
      removeRecordings: async (paths) => { batches.push(paths); },
      deleteAuthUser,
    });
    expect(batches).toEqual([["one", "two"], ["three"]]);
    expect(deleteAuthUser).toHaveBeenCalledOnce();
  });

  it("keeps the auth user when any storage batch fails", async () => {
    const deleteAuthUser = vi.fn();
    await expect(deleteAccountResources({
      recordingPaths: ["one"],
      removeRecordings: async () => { throw new Error("unavailable"); },
      deleteAuthUser,
    })).rejects.toEqual(expect.objectContaining<Partial<DeletionFailure>>({ code: "recording_delete_failed" }));
    expect(deleteAuthUser).not.toHaveBeenCalled();
  });
});
