import { describe, expect, it } from "vitest";
import { createWaveformPreview, extractAudioFeatures } from "./features";

function sineWave(frequency: number, durationSeconds: number, sampleRate = 12_000) {
  const samples = new Float32Array(durationSeconds * sampleRate);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.2;
  }
  return { samples, sampleRate };
}

describe("extractAudioFeatures", () => {
  it("extracts stable, serializable features from a sustained tone", () => {
    const input = sineWave(140, 6);
    const first = extractAudioFeatures(input.samples, input.sampleRate);
    const second = extractAudioFeatures(input.samples, input.sampleRate);

    expect(first).toEqual(second);
    expect(first.durationSeconds).toBe(6);
    expect(first.rms).toBeGreaterThan(0.1);
    expect(first.voicedCoverage).toBeGreaterThan(0.9);
    expect(first.pitchMeanHz).toBeGreaterThan(130);
    expect(first.pitchMeanHz).toBeLessThan(150);
    expect(first.clippingRatio).toBe(0);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it("creates a bounded, compact waveform preview", () => {
    const input = sineWave(120, 6);
    const waveform = createWaveformPreview(input.samples, 80);

    expect(waveform).toHaveLength(80);
    expect(Math.max(...waveform)).toBeLessThanOrEqual(1);
    expect(Math.min(...waveform)).toBeGreaterThanOrEqual(0);
  });

  it("handles empty input without non-finite values", () => {
    const features = extractAudioFeatures(new Float32Array(), 48_000);
    expect(features.durationSeconds).toBe(0);
    expect(features.rms).toBe(0);
    expect(features.pitchMeanHz).toBeNull();
    expect(features.breathSupport).toBe(0.5);
  });
});
