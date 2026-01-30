/**
 * Audio Service for Voice Recording and Playback
 * Uses native AudioRecord for PCM streaming and native AudioTrack for playback
 * Implements VAD (Voice Activity Detection) for automatic speech end detection
 */

import { Audio } from 'expo-av';
import { Buffer } from 'buffer';
import { DeviceEventEmitter, NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type RecordingState = 'idle' | 'recording' | 'paused';
export type PlaybackState = 'idle' | 'playing' | 'paused';

export interface AudioServiceCallbacks {
  onRecordingStateChange?: (state: RecordingState) => void;
  onPlaybackStateChange?: (state: PlaybackState) => void;
  onAudioData?: (base64Data: string) => void;
  onSilenceDetected?: () => void;  // Called when 1.5s silence is detected
  onSpeechStart?: () => void;      // Called when user starts speaking
  onError?: (error: string) => void;
}

// Audio recording settings optimized for speech (PCM streaming)
const RECORDING_OPTIONS = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  audioSource: 5,
  wavFile: 'recording.wav',
};

const PCM_DEBUG = true;
const AUDIO_DEBUG = true;
const PCM_ENABLE_AEC = true;
const PCM_ENABLE_NS = false;
const PCM_GAIN = 1.0;
const PCM_BUILD_TAG = 'rec-src=MIC aec=off ns=off gain=1.0';
const AUDIO_SOURCE_MIC = 1;
const AUDIO_SOURCE_VOICE_RECOGNITION = 6;
const CLIP_SAMPLE_THRESHOLD = 32760;
const CLIP_RATIO_THRESHOLD = 0.2;
const CLIP_FRAMES_THRESHOLD = 5;
const CLIP_WINDOW_MS = 1500;

// Silence detection settings
const SILENCE_THRESHOLD = -35;  // dB threshold for silence (higher = easier to trigger)
const SILENCE_DURATION = 1500;  // ms of silence to trigger end of speech
// const MAX_SPEECH_DURATION = 12000;  // ms max continuous speech before auto-end

export class AudioService {
  private callbacks: AudioServiceCallbacks;
  private recordingState: RecordingState = 'idle';
  private playbackState: PlaybackState = 'idle';

  // VAD (Voice Activity Detection) state
  private silenceStartTime: number | null = null;
  private isSpeaking: boolean = false;
  private speechStartTime: number | null = null;
  private audioDataListenerBound = false;
  private recorderSubscriptions: any[] = [];
  private recorderReady: boolean = false;
  private audioSource: number = RECORDING_OPTIONS.audioSource;
  private switchingSource = false;
  private fallbackAttempted = false;
  private clipFrames = 0;
  private clipWindowStart = 0;
  private audioFrames = 0;
  private lastAudioAt = 0;
  private vadEnabled: boolean = true;
  private noDataTimer: NodeJS.Timeout | null = null;
  private noDataRetry = 0;
  private readonly noDataTimeoutMs = 1200;
  private initInFlight: Promise<boolean> | null = null;

  // PCM playback (Android native)
  private pcmQueue: Array<{ data: string; durationMs: number }> = [];
  private pcmQueuedMs: number = 0;
  private pcmInFlightMs: number = 0;
  private pcmClockStart: number | null = null;
  private pcmIsPlaying: boolean = false;
  private pcmReady: boolean = false;
  private pcmInitInFlight: boolean = false;
  private pcmMonitorTimer: NodeJS.Timeout | null = null;
  private pcmConfig = { sampleRate: 24000, channels: 1, bitsPerSample: 16 };

  private startThresholdMs: number = 250;
  private lowWatermarkMs: number = 120;
  private maxBufferMs: number = 1000;

  private pcmPlayer = NativeModules.PCMPlayer;
  private recorderModule = NativeModules.PCMRecorder;
  private recorderEventNames = ['PCMRecorderData'];
  private recorderEmitter: NativeEventEmitter | null = null;
  private recorderDeviceEmitter = DeviceEventEmitter;

  constructor(callbacks: AudioServiceCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Initialize audio permissions and mode
   */
  async initialize(): Promise<boolean> {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        this.callbacks.onError?.('麦克风权限未授权');
        return false;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      if (!this.recorderModule) {
        this.callbacks.onError?.('录音模块未加载，请检查原生模块是否已注册');
        return false;
      }

      // Init recorder once on session entry.
      await this.ensureRecorderReady();

      return true;
    } catch (e: any) {
      console.error('[Audio] Initialize error:', e);
      this.callbacks.onError?.(e.message || '音频初始化失败');
      return false;
    }
  }

  /**
   * Start recording audio
   */
  async startRecording(): Promise<boolean> {
    try {
      if (this.recordingState === 'recording') {
        return true;
      }
      console.log('[Audio] Starting recording...');
      if (!this.recorderModule) {
        this.callbacks.onError?.('录音模块未加载，请检查原生模块是否已注册');
        return false;
      }
      if (this.initInFlight) {
        await this.initInFlight;
      }
      if (!this.recorderReady) {
        this.callbacks.onError?.('录音未初始化');
        return false;
      }
      if (!this.audioDataListenerBound) {
        if (!this.recorderEmitter && this.recorderModule?.addListener && this.recorderModule?.removeListeners) {
          this.recorderEmitter = new NativeEventEmitter(this.recorderModule);
        }
        const emitter = this.recorderEmitter ?? this.recorderDeviceEmitter;
        this.recorderSubscriptions = this.recorderEventNames.map((eventName) =>
          emitter.addListener(eventName, (data: string) => {
            if (this.recordingState !== 'recording') {
              return;
            }
            this.audioFrames += 1;
            this.lastAudioAt = Date.now();
            if (AUDIO_DEBUG && (this.audioFrames === 1 || this.audioFrames % 50 === 0)) {
              console.log(`[Audio] pcm frame=${this.audioFrames} bytes=${data.length}`);
            }
            this.callbacks.onAudioData?.(data);
            this.processVAD(data);
          })
        ).filter(Boolean) as any[];
        this.audioDataListenerBound = true;
      }
      this.audioFrames = 0;
      this.lastAudioAt = 0;
      this.noDataRetry = 0;
      this.setRecordingState('recording');
      this.stopVAD();
      await this.recorderModule?.start?.();
      this.scheduleNoDataCheck();

      return true;
    } catch (e: any) {
      console.error('[Audio] Start recording error:', e);
      this.callbacks.onError?.(e.message || '开始录音失败');
      return false;
    }
  }

  /**
   * Stop recording and return the audio data
   */
  async stopRecording(): Promise<string | null> {
    try {
      console.log('[Audio] Stopping recording...');
      this.clearNoDataCheck();
      await this.recorderModule?.stop?.();
      this.stopVAD();
      this.setRecordingState('idle');
      // Keep recorder allocated; only release on cleanup.
      return null;
    } catch (e: any) {
      console.error('[Audio] Stop recording error:', e);
      this.callbacks.onError?.(e.message || '停止录音失败');
      return null;
    }
  }

  private processVAD(base64Pcm: string) {
    if (!this.vadEnabled) {
      return;
    }
    const buffer = Buffer.from(base64Pcm, 'base64');
    if (buffer.length < 2) {
      return;
    }

    let sumSquares = 0;
    let clipCount = 0;
    const sampleCount = Math.floor(buffer.length / 2);
    for (let i = 0; i + 1 < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i);
      sumSquares += sample * sample;
      if (sample >= CLIP_SAMPLE_THRESHOLD || sample <= -CLIP_SAMPLE_THRESHOLD) {
        clipCount += 1;
      }
    }
    const rms = Math.sqrt(sumSquares / sampleCount);
    const db = rms > 0 ? 20 * Math.log10(rms / 32768) : -100;

    if (AUDIO_DEBUG && this.audioFrames % 50 === 0) {
      console.log(`[Audio] rms=${rms.toFixed(1)} db=${db.toFixed(1)}`);
    }
    this.detectClipping(clipCount, sampleCount);

    if (db > SILENCE_THRESHOLD) {
      if (!this.isSpeaking) {
        this.speechStartTime = Date.now();
      }
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.callbacks.onSpeechStart?.();
      }
      this.silenceStartTime = null;
      // if (
      //   this.speechStartTime &&
      //   Date.now() - this.speechStartTime >= MAX_SPEECH_DURATION
      // ) {
      //   this.isSpeaking = false;
      //   this.silenceStartTime = null;
      //   this.speechStartTime = null;
      //   this.callbacks.onSilenceDetected?.();
      // }
    } else if (this.isSpeaking) {
      if (this.silenceStartTime === null) {
        this.silenceStartTime = Date.now();
      } else if (Date.now() - this.silenceStartTime >= SILENCE_DURATION) {
        console.log('[Audio] Silence detected - speech ended');
        this.isSpeaking = false;
        this.silenceStartTime = null;
        this.speechStartTime = null;
        this.callbacks.onSilenceDetected?.();
      }
    }
  }

  /**
   * Start Voice Activity Detection
   */
  /**
   * Stop Voice Activity Detection
   */
  private stopVAD() {
    this.silenceStartTime = null;
    this.isSpeaking = false;
    this.speechStartTime = null;
    this.clipFrames = 0;
    this.clipWindowStart = 0;
  }

  setVadEnabled(enabled: boolean) {
    if (this.vadEnabled === enabled) {
      return;
    }
    this.vadEnabled = enabled;
    if (!enabled) {
      this.stopVAD();
    }
  }

  private scheduleNoDataCheck() {
    if (this.noDataTimer) {
      return;
    }
    this.noDataTimer = setTimeout(() => {
      this.noDataTimer = null;
      if (!this.isRecording()) {
        return;
      }
      if (this.lastAudioAt === 0 && this.noDataRetry < 1) {
        this.noDataRetry += 1;
        console.warn('[Audio] no PCM data, restarting recorder...');
        void this.restartRecorder();
      }
    }, this.noDataTimeoutMs);
  }

  private clearNoDataCheck() {
    if (this.noDataTimer) {
      clearTimeout(this.noDataTimer);
      this.noDataTimer = null;
    }
  }

  private async restartRecorder() {
    try {
      console.warn('[Audio] restartRecorder disabled (stability mode)');
    } catch (e) {
      console.error('[Audio] restart recorder failed:', e);
    }
  }

  private detectClipping(clipCount: number, sampleCount: number) {
    if (Platform.OS !== 'android' || this.fallbackAttempted) {
      return;
    }
    const now = Date.now();
    if (this.clipWindowStart === 0 || now - this.clipWindowStart > CLIP_WINDOW_MS) {
      this.clipWindowStart = now;
      this.clipFrames = 0;
    }
    const clipRatio = sampleCount > 0 ? clipCount / sampleCount : 0;
    if (clipRatio >= CLIP_RATIO_THRESHOLD) {
      this.clipFrames += 1;
      // if (
      //   this.clipFrames >= CLIP_FRAMES_THRESHOLD &&
      //   this.audioSource === AUDIO_SOURCE_VOICE_RECOGNITION
      // ) {
      //   this.fallbackAttempted = true;
      //   void this.switchAudioSource(AUDIO_SOURCE_MIC);
      // }
    }
  }

  private async switchAudioSource(nextSource: number) {
    if (__DEV__ && Platform.OS === 'android') {
      console.log('[Audio] switchAudioSource disabled in dev/emulator');
      return;
    }
    if (this.isRecording()) {
      return;
    }
    if (this.switchingSource || !this.recorderModule?.init) {
      return;
    }
    this.switchingSource = true;
    try {
      console.log(`[Audio] Switching audio source to ${nextSource}`);
      this.audioSource = nextSource;
      this.recorderReady = false;
    } catch (e: any) {
      console.error('[Audio] Switch audio source error:', e);
      this.callbacks.onError?.(e.message || '切换录音源失败');
    } finally {
      this.switchingSource = false;
    }
  }

  private async ensureRecorderReady(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }
    if (!this.recorderModule?.init) {
      return false;
    }
    if (this.recorderReady) {
      return true;
    }
    if (this.initInFlight) {
      return this.initInFlight;
    }
    this.initInFlight = (async () => {
      console.log('[Audio] init (ensureRecorderReady)', { source: this.audioSource });
      await this.recorderModule!.init(
        RECORDING_OPTIONS.sampleRate,
        RECORDING_OPTIONS.channels,
        RECORDING_OPTIONS.bitsPerSample,
        this.audioSource,
        PCM_ENABLE_AEC,
        PCM_ENABLE_NS,
        PCM_GAIN
      );
      if (this.recorderModule?.setDebug) {
        this.recorderModule.setDebug(PCM_DEBUG);
      }
      this.recorderReady = true;
      return true;
    })().finally(() => {
      this.initInFlight = null;
    });
    return this.initInFlight;
  }


  isRecording(): boolean {
    return this.recordingState === 'recording';
  }

  /**
   * Add audio to playback queue (for TTS)
   */
  queueAudio(
    base64Audio: string,
    meta?: {
      format?: string;
      sampleRate?: number;
      channels?: number;
      bitsPerSample?: number;
    }
  ) {
    const format = (meta?.format || 'pcm').toLowerCase();
    const isPcm = format === 'pcm' || format === 'pcm_s16le' || format === 's16le';
    if (!isPcm || Platform.OS !== 'android' || !this.pcmPlayer) {
      // PCM streaming requires native AudioTrack; ignore non-PCM here.
      return;
    }

    this.updatePcmConfig(meta);
    this.enqueuePcm(base64Audio);
  }

  private updatePcmConfig(meta?: {
    sampleRate?: number;
    channels?: number;
    bitsPerSample?: number;
  }) {
    const next = {
      sampleRate: meta?.sampleRate || this.pcmConfig.sampleRate,
      channels: meta?.channels || this.pcmConfig.channels,
      bitsPerSample: meta?.bitsPerSample || this.pcmConfig.bitsPerSample,
    };
    const changed =
      next.sampleRate !== this.pcmConfig.sampleRate ||
      next.channels !== this.pcmConfig.channels ||
      next.bitsPerSample !== this.pcmConfig.bitsPerSample;
    if (changed) {
      this.pcmConfig = next;
      this.resetPcmPlayer();
    }
  }

  private resetPcmPlayer() {
    try {
      this.pcmPlayer?.stop?.();
    } catch (_) {
      // Ignore stop failures
    }
    this.pcmIsPlaying = false;
    this.pcmReady = false;
    this.pcmInitInFlight = false;
    this.pcmInFlightMs = 0;
    this.pcmQueuedMs = 0;
    this.pcmClockStart = null;
    this.pcmQueue = [];
    this.stopPcmMonitor();
  }

  private enqueuePcm(base64Audio: string) {
    const bytes = Buffer.from(base64Audio, 'base64');
    const bytesPerSec =
      this.pcmConfig.sampleRate *
      this.pcmConfig.channels *
      (this.pcmConfig.bitsPerSample / 8);
    const durationMs = Math.max(1, (bytes.length / bytesPerSec) * 1000);

    this.trimPcmQueue(durationMs);

    this.pcmQueue.push({ data: base64Audio, durationMs });
    this.pcmQueuedMs += durationMs;

    if (!this.pcmIsPlaying) {
      void this.maybeStartPcmPlayback();
    } else {
      this.flushPcmQueue();
    }
  }

  private trimPcmQueue(incomingMs: number) {
    while (
      this.pcmQueuedMs + this.pcmInFlightMs + incomingMs >
        this.maxBufferMs &&
      this.pcmQueue.length > 0
    ) {
      const dropped = this.pcmQueue.shift();
      if (dropped) {
        this.pcmQueuedMs = Math.max(0, this.pcmQueuedMs - dropped.durationMs);
      }
    }
  }

  private async maybeStartPcmPlayback() {
    const totalMs = this.pcmQueuedMs + this.pcmInFlightMs;
    if (totalMs < this.startThresholdMs) {
      return;
    }
    const ready = await this.ensurePcmReady();
    if (!ready) {
      return;
    }
    this.pcmPlayer?.start?.();
    this.pcmIsPlaying = true;
    this.pcmClockStart = Date.now();
    this.setPlaybackState('playing');
    this.startPcmMonitor();
    this.flushPcmQueue();
  }

  private async ensurePcmReady(): Promise<boolean> {
    if (this.pcmReady) {
      return true;
    }
    if (!this.pcmPlayer?.init) {
      return false;
    }
    if (this.pcmInitInFlight) {
      return false;
    }
    this.pcmInitInFlight = true;
    try {
      await this.pcmPlayer.init(
        this.pcmConfig.sampleRate,
        this.pcmConfig.channels,
        this.pcmConfig.bitsPerSample
      );
      this.pcmReady = true;
      return true;
    } catch (e: any) {
      console.error('[Audio] PCM init error:', e);
      return false;
    } finally {
      this.pcmInitInFlight = false;
    }
  }

  private flushPcmQueue() {
    if (!this.pcmIsPlaying) {
      return;
    }
    while (this.pcmQueue.length > 0) {
      const item = this.pcmQueue.shift();
      if (!item) {
        continue;
      }
      this.updateInFlight();
      this.pcmPlayer?.write?.(item.data);
      this.pcmQueuedMs = Math.max(0, this.pcmQueuedMs - item.durationMs);
      this.pcmInFlightMs += item.durationMs;
      if (this.pcmClockStart === null) {
        this.pcmClockStart = Date.now();
      }
    }
  }

  private updateInFlight() {
    if (!this.pcmIsPlaying || this.pcmClockStart === null) {
      return;
    }
    const now = Date.now();
    const elapsed = now - this.pcmClockStart;
    if (elapsed > 0) {
      this.pcmInFlightMs = Math.max(0, this.pcmInFlightMs - elapsed);
      this.pcmClockStart = now;
    }
  }

  private startPcmMonitor() {
    if (this.pcmMonitorTimer) {
      return;
    }
    this.pcmMonitorTimer = setInterval(() => {
      if (!this.pcmIsPlaying) {
        this.stopPcmMonitor();
        return;
      }
      this.updateInFlight();
      const totalMs = this.pcmQueuedMs + this.pcmInFlightMs;
      if (totalMs <= 0) {
        this.stopPcmPlayback();
      } else if (totalMs < this.lowWatermarkMs && this.pcmQueuedMs === 0) {
        this.stopPcmPlayback();
      }
    }, 50);
  }

  private stopPcmMonitor() {
    if (this.pcmMonitorTimer) {
      clearInterval(this.pcmMonitorTimer);
      this.pcmMonitorTimer = null;
    }
  }

  /**
   * Stop current audio playback (for interrupt)
   */
  async stopPlayback(): Promise<void> {
    try {
      this.stopPcmPlayback();
    } catch (e) {
      // Ignore errors when stopping
    }
  }

  private stopPcmPlayback() {
    try {
      this.pcmPlayer?.stop?.();
    } catch (_) {
      // Ignore stop failures
    }
    this.pcmIsPlaying = false;
    this.pcmReady = false;
    this.pcmInFlightMs = 0;
    this.pcmQueuedMs = 0;
    this.pcmClockStart = null;
    this.pcmQueue = [];
    this.stopPcmMonitor();
    this.setPlaybackState('idle');
  }

  /**
   * Check if currently playing audio
   */
  isPlaying(): boolean {
    return this.playbackState === 'playing';
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.recordingState === 'recording';
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.stopVAD();
    await this.stopRecording();
    await this.stopPlayback();
    await this.recorderModule?.release?.();
    if (this.recorderSubscriptions.length > 0) {
      this.recorderSubscriptions.forEach((sub) => sub?.remove?.());
      this.recorderSubscriptions = [];
      this.audioDataListenerBound = false;
    }
    this.recorderReady = false;
  }

  private setRecordingState(state: RecordingState) {
    this.recordingState = state;
    this.callbacks.onRecordingStateChange?.(state);
  }

  private setPlaybackState(state: PlaybackState) {
    this.playbackState = state;
    this.callbacks.onPlaybackStateChange?.(state);
  }
}
