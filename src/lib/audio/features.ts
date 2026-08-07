import { AUDIO_FEATURE_VERSION, type AudioFeatures } from "./types";

const ANALYSIS_SAMPLE_RATE = 12_000;
const MIN_PITCH_HZ = 60;
const MAX_PITCH_HZ = 300;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

function standardDeviation(values: number[], average: number): number {
  if (values.length < 2) return 0;
  let total = 0;
  for (const value of values) total += (value - average) ** 2;
  return Math.sqrt(total / values.length);
}

function downsample(samples: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate <= ANALYSIS_SAMPLE_RATE) return samples;
  const ratio = sourceRate / ANALYSIS_SAMPLE_RATE;
  const result = new Float32Array(Math.floor(samples.length / ratio));

  for (let index = 0; index < result.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let total = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      total += samples[sourceIndex] ?? 0;
    }
    result[index] = total / (end - start);
  }

  return result;
}

function estimatePitch(
  frame: Float32Array,
  sampleRate: number,
): { frequency: number; confidence: number } | null {
  let frameMean = 0;
  for (const sample of frame) frameMean += sample;
  frameMean /= frame.length;

  let energy = 0;
  for (const sample of frame) energy += (sample - frameMean) ** 2;
  if (energy / frame.length < 0.00004) return null;

  const minimumLag = Math.floor(sampleRate / MAX_PITCH_HZ);
  const maximumLag = Math.min(Math.ceil(sampleRate / MIN_PITCH_HZ), frame.length - 2);
  let bestLag = 0;
  let bestCorrelation = 0;

  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    let numerator = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = 0; index < frame.length - lag; index += 1) {
      const left = (frame[index] ?? 0) - frameMean;
      const right = (frame[index + lag] ?? 0) - frameMean;
      numerator += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const denominator = Math.sqrt(leftEnergy * rightEnergy);
    const correlation = denominator > 0 ? numerator / denominator : 0;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag === 0 || bestCorrelation < 0.45) return null;
  return { frequency: sampleRate / bestLag, confidence: bestCorrelation };
}

export function extractAudioFeatures(
  samples: Float32Array,
  sampleRate: number,
): AudioFeatures {
  const durationSeconds = sampleRate > 0 ? samples.length / sampleRate : 0;
  let sumSquares = 0;
  let peakAmplitude = 0;
  let clippedSamples = 0;

  for (const rawSample of samples) {
    const sample = Math.abs(rawSample);
    sumSquares += sample * sample;
    if (sample > peakAmplitude) peakAmplitude = sample;
    if (sample >= 0.995) clippedSamples += 1;
  }

  const rms = samples.length > 0 ? Math.sqrt(sumSquares / samples.length) : 0;
  const clippingRatio = samples.length > 0 ? clippedSamples / samples.length : 0;
  const reduced = downsample(samples, sampleRate);
  const analysisRate = sampleRate <= ANALYSIS_SAMPLE_RATE ? sampleRate : ANALYSIS_SAMPLE_RATE;
  const frameSize = Math.max(256, Math.round(analysisRate * 0.04));
  const hopSize = Math.max(128, Math.floor(frameSize / 2));
  const pitches: number[] = [];
  const amplitudes: number[] = [];
  let voicedFrames = 0;
  let totalFrames = 0;

  for (let offset = 0; offset + frameSize <= reduced.length; offset += hopSize) {
    const frame = reduced.subarray(offset, offset + frameSize);
    let frameSquares = 0;
    for (const sample of frame) frameSquares += sample * sample;
    const frameRms = Math.sqrt(frameSquares / frame.length);
    totalFrames += 1;
    if (frameRms < 0.006) continue;
    const pitch = estimatePitch(frame, analysisRate);
    if (!pitch) continue;
    voicedFrames += 1;
    pitches.push(pitch.frequency);
    amplitudes.push(frameRms);
  }

  const pitchMean = pitches.length > 0 ? mean(pitches) : null;
  const amplitudeMean = mean(amplitudes);
  let jitter = 0;
  let shimmer = 0;

  if (pitches.length > 1 && pitchMean && pitchMean > 0) {
    let pitchDelta = 0;
    let amplitudeDelta = 0;
    for (let index = 1; index < pitches.length; index += 1) {
      pitchDelta += Math.abs((pitches[index] ?? 0) - (pitches[index - 1] ?? 0));
      amplitudeDelta += Math.abs((amplitudes[index] ?? 0) - (amplitudes[index - 1] ?? 0));
    }
    jitter = pitchDelta / (pitches.length - 1) / pitchMean;
    shimmer = amplitudeMean > 0
      ? amplitudeDelta / (amplitudes.length - 1) / amplitudeMean
      : 0;
  }

  let normalizedDecay = 0;
  if (amplitudes.length > 2 && amplitudeMean > 0) {
    const timeMean = (amplitudes.length - 1) / 2;
    let covariance = 0;
    let timeVariance = 0;
    for (let index = 0; index < amplitudes.length; index += 1) {
      covariance += (index - timeMean) * ((amplitudes[index] ?? 0) - amplitudeMean);
      timeVariance += (index - timeMean) ** 2;
    }
    const slope = timeVariance > 0 ? covariance / timeVariance : 0;
    normalizedDecay = Math.max(0, -slope / amplitudeMean);
  }

  const amplitudeVariation = amplitudeMean > 0
    ? standardDeviation(amplitudes, amplitudeMean) / amplitudeMean
    : 1;

  return {
    version: AUDIO_FEATURE_VERSION,
    durationSeconds,
    sampleRate,
    rms: clamp(rms),
    peakAmplitude: clamp(peakAmplitude, 0, 1.5),
    voicedCoverage: totalFrames > 0 ? voicedFrames / totalFrames : 0,
    clippingRatio,
    pitchMeanHz: pitchMean,
    pitchVariation: pitchMean ? clamp(standardDeviation(pitches, pitchMean) / pitchMean, 0, 2) : 0,
    jitter: clamp(jitter),
    shimmer: clamp(shimmer),
    breathSupport: clamp(1 - normalizedDecay * 12 - amplitudeVariation * 0.5),
  };
}

/** Produces a small amplitude envelope for display and upload metadata. */
export function createWaveformPreview(
  samples: Float32Array,
  desiredPoints = 160,
): number[] {
  if (samples.length === 0) return [];
  const points = Math.min(desiredPoints, samples.length);
  const bucketSize = samples.length / points;
  const result: number[] = [];

  for (let point = 0; point < points; point += 1) {
    const start = Math.floor(point * bucketSize);
    const end = Math.max(start + 1, Math.floor((point + 1) * bucketSize));
    let peak = 0;
    for (let index = start; index < end; index += 1) {
      peak = Math.max(peak, Math.abs(samples[index] ?? 0));
    }
    result.push(Math.min(1, peak));
  }

  return result;
}
