/**
 * Audio Service for Voice Recording and Playback
 * Uses AudioRecord for PCM streaming and expo-av for playback
 * Implements VAD (Voice Activity Detection) for automatic speech end detection
 */

import { Audio, AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import AudioRecord from 'react-native-audio-record';
import { Buffer } from 'buffer';

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
  audioSource: 6, // Android VOICE_RECOGNITION
  wavFile: 'recording.wav',
};

// Silence detection settings
const SILENCE_THRESHOLD = -40;  // dB threshold for silence
const SILENCE_DURATION = 1500;  // ms of silence to trigger end of speech

export class AudioService {
  private sound: Audio.Sound | null = null;
  private callbacks: AudioServiceCallbacks;
  private recordingState: RecordingState = 'idle';
  private playbackState: PlaybackState = 'idle';

  // VAD (Voice Activity Detection) state
  private silenceStartTime: number | null = null;
  private isSpeaking: boolean = false;
  private audioDataListenerBound = false;

  // Audio queue for TTS playback
  private audioQueue: string[] = [];
  private isProcessingQueue: boolean = false;

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
      // Create and start new recording
      console.log('[Audio] Starting recording...');
      AudioRecord.init(RECORDING_OPTIONS);
      if (!this.audioDataListenerBound) {
        AudioRecord.on('data', (data: string) => {
          this.callbacks.onAudioData?.(data);
          this.processVAD(data);
        });
        this.audioDataListenerBound = true;
      }
      AudioRecord.start();
      this.setRecordingState('recording');

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
      AudioRecord.stop();
      this.stopVAD();
      this.setRecordingState('idle');
      return null;
    } catch (e: any) {
      console.error('[Audio] Stop recording error:', e);
      this.callbacks.onError?.(e.message || '停止录音失败');
      return null;
    }
  }

  private processVAD(base64Pcm: string) {
    const buffer = Buffer.from(base64Pcm, 'base64');
    if (buffer.length < 2) {
      return;
    }

    let sumSquares = 0;
    const sampleCount = Math.floor(buffer.length / 2);
    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i);
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / sampleCount);
    const db = rms > 0 ? 20 * Math.log10(rms / 32768) : -100;

    if (db > SILENCE_THRESHOLD) {
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.callbacks.onSpeechStart?.();
      }
      this.silenceStartTime = null;
    } else if (this.isSpeaking) {
      if (this.silenceStartTime === null) {
        this.silenceStartTime = Date.now();
      } else if (Date.now() - this.silenceStartTime >= SILENCE_DURATION) {
        console.log('[Audio] Silence detected - speech ended');
        this.isSpeaking = false;
        this.silenceStartTime = null;
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
  }

  /**
   * Add audio to playback queue (for TTS)
   */
  queueAudio(base64Audio: string) {
    this.audioQueue.push(base64Audio);
    this.processAudioQueue();
  }

  /**
   * Process audio queue for playback
   */
  private async processAudioQueue() {
    if (this.isProcessingQueue || this.audioQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.audioQueue.length > 0) {
      const audioData = this.audioQueue.shift();
      if (audioData) {
        await this.playAudio(audioData);
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Play audio from base64 data
   */
  async playAudio(base64Audio: string): Promise<void> {
    try {
      // Stop any current playback
      await this.stopPlayback();

      // Write base64 to temp file
      const tempUri = FileSystem.cacheDirectory + `tts_${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(tempUri, base64Audio, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Load and play
      const { sound } = await Audio.Sound.createAsync(
        { uri: tempUri },
        { shouldPlay: true }
      );
      this.sound = sound;
      this.setPlaybackState('playing');

      // Wait for playback to complete
      return new Promise((resolve) => {
        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
          if (status.isLoaded && status.didJustFinish) {
            this.setPlaybackState('idle');
            sound.unloadAsync();
            FileSystem.deleteAsync(tempUri, { idempotent: true });
            resolve();
          }
        });
      });
    } catch (e: any) {
      console.error('[Audio] Play error:', e);
      this.setPlaybackState('idle');
    }
  }

  /**
   * Stop current audio playback (for interrupt)
   */
  async stopPlayback(): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
        this.sound = null;
      }
      // Clear the queue
      this.audioQueue = [];
      this.isProcessingQueue = false;
      this.setPlaybackState('idle');
    } catch (e) {
      // Ignore errors when stopping
    }
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
