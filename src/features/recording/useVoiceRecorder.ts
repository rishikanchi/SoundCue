"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playSoundCue } from "../../lib/audio/cues";
import { createWaveformPreview, extractAudioFeatures } from "../../lib/audio/features";
import { extensionForMimeType, selectSupportedMimeType } from "../../lib/audio/mime";
import {
  MAX_RECORDING_SECONDS,
  MIN_RECORDING_SECONDS,
  TARGET_RECORDING_SECONDS,
  evaluateAudioQuality,
} from "../../lib/audio/quality";
import type {
  AcceptedRecording,
  AudioQualityReport,
  MicrophonePermission,
  RecordingError,
  RecordingPhase,
} from "../../lib/audio/types";

interface RecordingReview extends AcceptedRecording {
  previewUrl: string;
}

export interface VoiceRecorderState {
  phase: RecordingPhase;
  permission: MicrophonePermission;
  countdown: number | null;
  elapsedSeconds: number;
  minimumSeconds: number;
  targetSeconds: number;
  maximumSeconds: number;
  canStop: boolean;
  liveInputStatus: "waiting" | "heard" | "low";
  liveWaveform: number[];
  review: RecordingReview | null;
  quality: AudioQualityReport | null;
  error: RecordingError | null;
}

export interface VoiceRecorderControls {
  begin: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  getAcceptedRecording: () => AcceptedRecording | null;
}

interface UseVoiceRecorderOptions {
  soundCuesEnabled?: boolean;
  onPhaseChange?: (phase: RecordingPhase) => void;
  onError?: (error: RecordingError) => void;
}

function flattenChunks(chunks: Float32Array[]): Float32Array {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const result = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function audioBufferToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return new Float32Array(buffer.getChannelData(0));
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const channelData = buffer.getChannelData(channel);
    for (let index = 0; index < channelData.length; index += 1) {
      mono[index] += (channelData[index] ?? 0) / buffer.numberOfChannels;
    }
  }
  return mono;
}

function microphoneError(error: unknown): RecordingError {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      code: "permission_denied",
      message: "Microphone access is turned off. Allow access in your browser settings, then try again.",
    };
  }
  if (name === "NotFoundError" || name === "NotReadableError" || name === "AbortError") {
    return {
      code: "microphone_unavailable",
      message: "We could not connect to a microphone. Check that one is available and not in use elsewhere.",
    };
  }
  return {
    code: "recording_failed",
    message: "We could not start the recording. Please check your microphone and try again.",
  };
}

export function useVoiceRecorder(
  options: UseVoiceRecorderOptions = {},
): readonly [VoiceRecorderState, VoiceRecorderControls] {
  const { soundCuesEnabled = true, onPhaseChange, onError } = options;
  const [phase, setPhaseState] = useState<RecordingPhase>("idle");
  const [permission, setPermission] = useState<MicrophonePermission>("unknown");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [liveInputStatus, setLiveInputStatus] = useState<"waiting" | "heard" | "low">("waiting");
  const [liveWaveform, setLiveWaveform] = useState<number[]>([]);
  const [review, setReview] = useState<RecordingReview | null>(null);
  const [error, setErrorState] = useState<RecordingError | null>(null);

  const mountedRef = useRef(true);
  const phaseRef = useRef<RecordingPhase>("idle");
  const cueEnabledRef = useRef(soundCuesEnabled);
  const phaseHandlerRef = useRef(onPhaseChange);
  const errorHandlerRef = useRef(onError);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(48_000);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const countdownTokenRef = useRef(0);
  const stoppingRef = useRef(false);
  const liveInputStatusRef = useRef<"waiting" | "heard" | "low">("waiting");
  const lowInputCuePlayedRef = useRef(false);
  const lastAudibleWaveformRef = useRef<Float32Array | null>(null);
  const reviewRef = useRef<RecordingReview | null>(null);

  useEffect(() => {
    cueEnabledRef.current = soundCuesEnabled;
    phaseHandlerRef.current = onPhaseChange;
    errorHandlerRef.current = onError;
    reviewRef.current = review;
  }, [soundCuesEnabled, onPhaseChange, onError, review]);

  const setPhase = useCallback((nextPhase: RecordingPhase) => {
    phaseRef.current = nextPhase;
    if (mountedRef.current) setPhaseState(nextPhase);
    phaseHandlerRef.current?.(nextPhase);
  }, []);

  const reportError = useCallback((nextError: RecordingError) => {
    if (mountedRef.current) setErrorState(nextError);
    errorHandlerRef.current?.(nextError);
    setPhase("error");
  }, [setPhase]);

  const clearSchedulers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    countdownTimerRef.current = null;
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }, []);

  const releaseCapture = useCallback(() => {
    clearSchedulers();
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    analyserRef.current = null;
    silentGainRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    recorderRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }, [clearSchedulers]);

  const finalizeRecording = useCallback(async (recorder: MediaRecorder, token: number) => {
    if (token !== countdownTokenRef.current) {
      releaseCapture();
      return;
    }
    try {
      const mimeType = recorder.mimeType || mediaChunksRef.current[0]?.type || "audio/webm";
      const blob = new Blob(mediaChunksRef.current, { type: mimeType });
      if (blob.size === 0) throw new Error("empty_recording");
      let samples = flattenChunks(pcmChunksRef.current);
      let sampleRate = sampleRateRef.current;
      if (samples.length === 0 && contextRef.current) {
        const decoded = await contextRef.current.decodeAudioData(await blob.arrayBuffer());
        samples = audioBufferToMono(decoded);
        sampleRate = decoded.sampleRate;
      }
      if (samples.length === 0) throw new Error("empty_audio_samples");
      const features = extractAudioFeatures(samples, sampleRate);
      const quality = evaluateAudioQuality(features);
      const waveformSamples = createWaveformPreview(samples);
      const nextReview: RecordingReview = {
        blob,
        mimeType,
        extension: extensionForMimeType(mimeType),
        durationSeconds: features.durationSeconds,
        waveformSamples,
        features,
        quality,
        previewUrl: URL.createObjectURL(blob),
      };
      releaseCapture();
      stoppingRef.current = false;
      if (!mountedRef.current) {
        URL.revokeObjectURL(nextReview.previewUrl);
        return;
      }
      setElapsedSeconds(features.durationSeconds);
      setLiveWaveform(waveformSamples);
      setReview(nextReview);
      setPhase("review");
      if (!quality.acceptable) void playSoundCue("warning", cueEnabledRef.current);
    } catch {
      releaseCapture();
      stoppingRef.current = false;
      reportError({
        code: "audio_processing_failed",
        message: "We could not prepare this recording for review. Please record it again.",
      });
    }
  }, [releaseCapture, reportError, setPhase]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (phaseRef.current !== "recording" || !recorder || stoppingRef.current) return;
    stoppingRef.current = true;
    clearSchedulers();
    setPhase("processing");
    void playSoundCue("end", cueEnabledRef.current);
    if (recorder.state !== "inactive") recorder.stop();
  }, [clearSchedulers, setPhase]);

  const startLiveWaveform = useCallback(() => {
    function draw() {
      const analyser = analyserRef.current;
      if (!analyser || phaseRef.current !== "recording") return;
      const analyserSamples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(analyserSamples);
      const samples = pcmChunksRef.current.at(-1) ?? analyserSamples;
      let sumSquares = 0;
      for (const sample of samples) sumSquares += sample * sample;
      const liveRms = Math.sqrt(sumSquares / samples.length);
      if (liveRms >= 0.015) {
        lastAudibleWaveformRef.current = new Float32Array(samples);
      }
      if (liveRms >= 0.015 && liveInputStatusRef.current !== "heard") {
        liveInputStatusRef.current = "heard";
        setLiveInputStatus("heard");
      } else if (
        liveRms < 0.015
        && performance.now() - startedAtRef.current >= 2_500
        && liveInputStatusRef.current === "waiting"
      ) {
        liveInputStatusRef.current = "low";
        setLiveInputStatus("low");
        if (!lowInputCuePlayedRef.current) {
          lowInputCuePlayedRef.current = true;
          void playSoundCue("warning", cueEnabledRef.current);
        }
      }
      setLiveWaveform(Array.from(lastAudibleWaveformRef.current ?? samples));
      animationFrameRef.current = requestAnimationFrame(draw);
    }
    animationFrameRef.current = requestAnimationFrame(draw);
  }, []);

  const begin = useCallback(async () => {
    if (!["idle", "review", "error"].includes(phaseRef.current)) return;

    countdownTokenRef.current += 1;
    const token = countdownTokenRef.current;
    if (reviewRef.current) URL.revokeObjectURL(reviewRef.current.previewUrl);
    setReview(null);
    setLiveWaveform([]);
    setElapsedSeconds(0);
    setLiveInputStatus("waiting");
    setCountdown(null);
    setErrorState(null);
    mediaChunksRef.current = [];
    pcmChunksRef.current = [];
    stoppingRef.current = false;
    liveInputStatusRef.current = "waiting";
    lowInputCuePlayedRef.current = false;
    lastAudibleWaveformRef.current = null;

    const AudioContextConstructor = typeof window !== "undefined"
      ? window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
    const mimeType = selectSupportedMimeType();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" || !AudioContextConstructor || mimeType === null) {
      reportError({
        code: "unsupported_browser",
        message: "This browser cannot make an audio recording. Try the latest version of Chrome, Edge, Firefox, or Safari.",
      });
      return;
    }

    setPhase("requesting_permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      if (token !== countdownTokenRef.current || !mountedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      setPermission("granted");
      streamRef.current = stream;

      const context = new AudioContextConstructor();
      contextRef.current = context;
      await context.resume();
      sampleRateRef.current = context.sampleRate;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.76;
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      processor.onaudioprocess = (event) => {
        if (phaseRef.current !== "recording") return;
        pcmChunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(analyser);
      source.connect(processor);
      analyser.connect(silentGain);
      processor.connect(silentGain);
      silentGain.connect(context.destination);
      sourceRef.current = source;
      analyserRef.current = analyser;
      processorRef.current = processor;
      silentGainRef.current = silentGain;

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 96_000 })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) mediaChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        countdownTokenRef.current += 1;
        releaseCapture();
        reportError({
          code: "recording_failed",
          message: "The recording stopped unexpectedly. Please try again.",
        });
      };
      recorder.onstop = () => void finalizeRecording(recorder, token);

      setPhase("countdown");
      for (const number of [3, 2, 1]) {
        if (token !== countdownTokenRef.current) return;
        setCountdown(number);
        void playSoundCue("countdown", cueEnabledRef.current);
        await new Promise<void>((resolve) => {
          countdownTimerRef.current = setTimeout(resolve, 850);
        });
      }
      if (token !== countdownTokenRef.current || !mountedRef.current) return;

      setCountdown(null);
      recorder.start(250);
      startedAtRef.current = performance.now();
      setPhase("recording");
      void playSoundCue("start", cueEnabledRef.current);
      startLiveWaveform();
      timerRef.current = setInterval(() => {
        const elapsed = (performance.now() - startedAtRef.current) / 1000;
        if (mountedRef.current) setElapsedSeconds(Math.min(MAX_RECORDING_SECONDS, elapsed));
        if (elapsed >= MAX_RECORDING_SECONDS) stop();
      }, 100);
    } catch (caughtError) {
      if (token !== countdownTokenRef.current) return;
      setPermission(caughtError instanceof DOMException && caughtError.name === "NotAllowedError" ? "denied" : "unknown");
      releaseCapture();
      const nextError = microphoneError(caughtError);
      reportError(nextError);
      if (nextError.code !== "permission_denied") void playSoundCue("warning", cueEnabledRef.current);
    }
  }, [finalizeRecording, releaseCapture, reportError, setPhase, startLiveWaveform, stop]);

  const reset = useCallback(() => {
    countdownTokenRef.current += 1;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    releaseCapture();
    if (reviewRef.current) URL.revokeObjectURL(reviewRef.current.previewUrl);
    stoppingRef.current = false;
    mediaChunksRef.current = [];
    pcmChunksRef.current = [];
    setReview(null);
    setLiveWaveform([]);
    setElapsedSeconds(0);
    setLiveInputStatus("waiting");
    setCountdown(null);
    setErrorState(null);
    setPhase("idle");
  }, [releaseCapture, setPhase]);

  const getAcceptedRecording = useCallback((): AcceptedRecording | null => {
    const current = reviewRef.current;
    if (!current?.quality.acceptable) return null;
    return {
      blob: current.blob,
      mimeType: current.mimeType,
      extension: current.extension,
      durationSeconds: current.durationSeconds,
      waveformSamples: current.waveformSamples,
      features: current.features,
      quality: current.quality,
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((status) => {
          if (mountedRef.current) setPermission(status.state);
          status.onchange = () => mountedRef.current && setPermission(status.state);
        })
        .catch(() => undefined);
    }
    return () => {
      mountedRef.current = false;
      countdownTokenRef.current += 1;
      releaseCapture();
      if (reviewRef.current) URL.revokeObjectURL(reviewRef.current.previewUrl);
    };
  }, [releaseCapture]);

  const state: VoiceRecorderState = {
    phase,
    permission,
    countdown,
    elapsedSeconds,
    minimumSeconds: MIN_RECORDING_SECONDS,
    targetSeconds: TARGET_RECORDING_SECONDS,
    maximumSeconds: MAX_RECORDING_SECONDS,
    canStop: phase === "recording" && elapsedSeconds >= MIN_RECORDING_SECONDS,
    liveInputStatus,
    liveWaveform,
    review,
    quality: review?.quality ?? null,
    error,
  };

  return [state, { begin, stop, reset, getAcceptedRecording }] as const;
}
