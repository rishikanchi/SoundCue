const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm",
] as const;

export function selectSupportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  if (typeof MediaRecorder.isTypeSupported !== "function") return "";
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function normalizeMimeType(type: string): string {
  return type.split(";", 1)[0]?.toLowerCase() || "audio/webm";
}

export function extensionForMimeType(type: string): "webm" | "ogg" | "mp4" {
  const normalized = normalizeMimeType(type);
  if (normalized === "audio/ogg") return "ogg";
  if (normalized === "audio/mp4") return "mp4";
  return "webm";
}
