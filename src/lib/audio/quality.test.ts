import { describe, expect, it } from "vitest";
import { extractAudioFeatures } from "./features";
import { evaluateAudioQuality } from "./quality";

function tone(durationSeconds: number, amplitude: number, sampleRate = 12_000) {
  const samples = new Float32Array(durationSeconds * sampleRate);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.sin((2 * Math.PI * 140 * index) / sampleRate) * amplitude;
  }
  return extractAudioFeatures(samples, sampleRate);
}

describe("evaluateAudioQuality", () => {
  it("accepts a clear sustained recording", () => {
    const quality = evaluateAudioQuality(tone(6, 0.2));
    expect(quality.acceptable).toBe(true);
    expect(quality.issues).toEqual([]);
  });

  it("reports short and silent recordings with actionable codes", () => {
    const quality = evaluateAudioQuality(
      extractAudioFeatures(new Float32Array(2 * 12_000), 12_000),
    );
    expect(quality.acceptable).toBe(false);
    expect(quality.issues.map((issue) => issue.code)).toEqual(["too_short", "silence"]);
  });

  it("reports clipped input", () => {
    const samples = new Float32Array(6 * 12_000);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.sin((2 * Math.PI * 140 * index) / 12_000) > 0 ? 1 : -1;
    }
    const quality = evaluateAudioQuality(extractAudioFeatures(samples, 12_000));
    expect(quality.issues.some((issue) => issue.code === "clipping")).toBe(true);
  });
});
