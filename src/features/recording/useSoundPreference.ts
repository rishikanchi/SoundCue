"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "soundcue:sound-preference:v1";
const CHANGE_EVENT = "soundcue:sound-preference-change";

function readPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "muted";
  } catch {
    return true;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

export function setSoundCuesEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "enabled" : "muted");
  } catch {
    // The preference remains enabled for this session if storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useSoundPreference(): readonly [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, readPreference, () => true);
  return [enabled, setSoundCuesEnabled] as const;
}
