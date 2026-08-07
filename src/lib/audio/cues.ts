export type SoundCueName = "countdown" | "start" | "end" | "warning";

interface ToneDefinition {
  frequency: number;
  overtone: number;
  duration: number;
  gain: number;
}

const TONES: Record<SoundCueName, ToneDefinition> = {
  countdown: { frequency: 440, overtone: 660, duration: 0.16, gain: 0.055 },
  start: { frequency: 523.25, overtone: 784.88, duration: 0.28, gain: 0.065 },
  end: { frequency: 392, overtone: 587.33, duration: 0.34, gain: 0.055 },
  warning: { frequency: 329.63, overtone: 493.88, duration: 0.42, gain: 0.05 },
};

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  try {
    sharedContext ??= new AudioContextConstructor();
  } catch {
    return null;
  }
  return sharedContext;
}

export async function playSoundCue(name: SoundCueName, enabled = true): Promise<void> {
  if (!enabled) return;
  const context = getContext();
  if (!context) return;
  try {
    if (context.state === "suspended") await context.resume();
  } catch {
    return;
  }

  const tone = TONES[name];
  const start = context.currentTime + 0.015;
  const end = start + tone.duration;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(tone.gain, start + 0.035);
  master.gain.exponentialRampToValueAtTime(0.0001, end);
  master.connect(context.destination);

  const fundamental = context.createOscillator();
  fundamental.type = "sine";
  fundamental.frequency.setValueAtTime(tone.frequency, start);
  fundamental.connect(master);

  const overtoneGain = context.createGain();
  overtoneGain.gain.setValueAtTime(0.16, start);
  overtoneGain.connect(master);
  const overtone = context.createOscillator();
  overtone.type = "sine";
  overtone.frequency.setValueAtTime(tone.overtone, start);
  overtone.connect(overtoneGain);

  fundamental.start(start);
  overtone.start(start);
  fundamental.stop(end);
  overtone.stop(end);
}
