/**
 * useConversation Hook
 * Combines WebSocket and Audio services for AI conversation
 * Handles the full conversation flow including voice recording, playback, and interruption
 * Supports new segment-based protocol with speech + board content
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ConversationWebSocket, ConnectionState, Segment, ConversationStateType, AiTextDelta, AudioEndMeta } from '../services/websocket';
import { AudioService, RecordingState, PlaybackState } from '../services/audio';

export type ConversationStatus = 'connecting' | 'listening' | 'speaking' | 'processing' | 'error' | 'idle';

export interface ConversationState {
  status: ConversationStatus;
  connectionState: ConnectionState;
  aiText: string;           // AI's current displayed text (typing effect)
  aiFullText: string;       // Full speech text for current segment
  userText: string;         // User's transcript
  userFullText: string;     // Accumulated user transcript
  error: string | null;
  isRecording: boolean;
  isPlaying: boolean;
  // Segment-based fields
  segments: Segment[];      // All completed segments (with board)
  boardMarkup: string;      // Combined board markup from all segments
  currentSegmentId: number; // Currently playing segment
  // Typing effect state
  currentSpeech: string;    // Full speech for current segment (for reference)
  displayedText: string;    // Currently displayed text (typing effect)
  // Close reason (for showing appropriate message to user)
  closeReason: string | null;
}

// Re-export types for convenience
export type { Segment, AiTextDelta, AudioEndMeta } from '../services/websocket';

export interface UseConversationOptions {
  conversationId: number;
  wsToken: string;
  autoConnect?: boolean;
  initialImageUrl?: string;
  onConnectionChange?: (state: ConnectionState) => void;
  onSegment?: (segment: Segment) => void;
  onStateChange?: (state: ConversationStateType) => void;
  onError?: (error: string) => void;
}

export function useConversation(options: UseConversationOptions) {
  const { conversationId, wsToken, autoConnect = true, initialImageUrl, onConnectionChange, onSegment, onStateChange, onError } = options;

  // State
  const [state, setState] = useState<ConversationState>({
    status: 'idle',
    connectionState: 'disconnected',
    aiText: '',
    aiFullText: '',
    userText: '',
    userFullText: '',
    error: null,
    isRecording: false,
    isPlaying: false,
    segments: [],
    boardMarkup: '',
    currentSegmentId: -1,
    currentSpeech: '',
    displayedText: '',
    closeReason: null,
  });

  // Refs for services
  const wsRef = useRef<ConversationWebSocket | null>(null);
  const audioRef = useRef<AudioService | null>(null);
  const sequenceRef = useRef<number>(1);
  const streamIdRef = useRef<string>('');
  const isPlayingRef = useRef<boolean>(false);
  const sentFramesRef = useRef<number>(0);
  const connectionStateRef = useRef<ConnectionState>('disconnected');
  const audioSeqRef = useRef<{ segmentId: number; nextSeq: number; buffer: Map<number, string> }>({
    segmentId: -1,
    nextSeq: 0,
    buffer: new Map(),
  });

  // Flag to track if AI is currently speaking (for interrupt logic)
  const aiSpeakingRef = useRef<boolean>(false);

  /**
   * Initialize services
   */
  const initialize = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, status: 'connecting', error: null }));

      // Initialize audio service
      audioRef.current = new AudioService({
        onRecordingStateChange: (recordingState: RecordingState) => {
          setState(prev => ({ ...prev, isRecording: recordingState === 'recording' }));
        },
        onPlaybackStateChange: (playbackState: PlaybackState) => {
          isPlayingRef.current = playbackState === 'playing';
          setState(prev => ({ ...prev, isPlaying: playbackState === 'playing' }));
          if (playbackState === 'idle' && autoConnect && !audioRef.current?.isRecording()) {
            void startListening();
          }
        },
        onAudioData: (base64Data: string) => {
          if (wsRef.current?.isConnected() && streamIdRef.current) {
            wsRef.current.sendAudioChunk(base64Data, streamIdRef.current, sequenceRef.current++);
            sentFramesRef.current += 1;
            if (sentFramesRef.current === 1 || sentFramesRef.current % 50 === 0) {
              console.log(`[Hook] sent audio frame=${sentFramesRef.current} bytes=${base64Data.length}`);
            }
          }
        },
        onSpeechStart: () => {
          console.log('[Hook] User started speaking');
          setState(prev => ({ ...prev, status: 'listening' }));
        },
        onSilenceDetected: async () => {
          console.log('[Hook] User stopped speaking (silence detected)');
          // Backend handles endpointing; keep streaming.
        },
        onError: (error) => {
          setState(prev => ({ ...prev, error }));
          onError?.(error);
        },
      });

      const audioInitialized = await audioRef.current.initialize();
      if (!audioInitialized) {
        throw new Error('音频初始化失败');
      }

      // Initialize WebSocket service
      wsRef.current = new ConversationWebSocket(conversationId, wsToken, {
        onConnectionChange: (connState: ConnectionState) => {
          setState(prev => ({ ...prev, connectionState: connState }));
          onConnectionChange?.(connState);

          if (connState === 'connected') {
            setState(prev => ({ ...prev, status: 'listening' }));
            wsRef.current?.sendClientHello({
              client: 'rn-android',
              app_version: '1.0.0',
              audio: {
                format: 'pcm_s16le',
                sample_rate: 16000,
                channels: 1,
                bits_per_sample: 16,
                frame_ms: 20,
              },
              capabilities: {
                asr_partial: true,
                ai_text_delta: true,
                board: true,
                interrupt: true,
              },
            });
            if (initialImageUrl) {
              wsRef.current?.sendImage(initialImageUrl);
            }
            if (autoConnect && !audioRef.current?.isRecording()) {
              void startListening();
            }
          } else if (connState === 'error' || connState === 'disconnected') {
            setState(prev => ({ ...prev, status: 'error' }));
          }
        },
        onStateChange: (serverState: import('../services/websocket').ConversationStateType) => {
          // Map server state to our status
          const statusMap: Record<string, ConversationStatus> = {
            'idle': 'idle',
            'listening': 'listening',
            'processing': 'processing',
            'speaking': 'speaking',
          };
          const newStatus = statusMap[serverState] || 'idle';
          setState(prev => {
            if (serverState === 'processing') {
              return {
                ...prev,
                status: newStatus,
                aiText: '',
                aiFullText: '',
                segments: [],
                boardMarkup: '',
                currentSpeech: '',
                displayedText: '',
                currentSegmentId: -1,
              };
            }
            return { ...prev, status: newStatus };
          });
          if (serverState === 'speaking') {
            aiSpeakingRef.current = true;
          }
          if (serverState === 'idle') {
            aiSpeakingRef.current = false;
            if (autoConnect && !audioRef.current?.isRecording()) {
              startListening();
            }
          }
          onStateChange?.(serverState);
        },
        onAsrPartial: (text: string) => {
          setState(prev => {
            const trimmed = text || '';
            return {
              ...prev,
              userText: trimmed,
              status: 'listening',
            };
          });
        },
        onAsrFinal: (text: string) => {
          setState(prev => {
            const trimmed = text || '';
            return {
              ...prev,
              userText: trimmed,
              userFullText: trimmed,
              status: 'processing',
            };
          });
        },
        onSegmentStart: (segmentId: number) => {
          console.log('[Hook] Segment start:', segmentId);
          // New segment begins - reset typing state
          audioSeqRef.current = { segmentId, nextSeq: 0, buffer: new Map() };
          setState(prev => ({
            ...prev,
            currentSegmentId: segmentId,
            currentSpeech: '',
            displayedText: '',
            aiText: '',
            aiFullText: '',
          }));
        },
        onAiTextDelta: (delta: AiTextDelta) => {
          // Accumulate AI text deltas (sentence-level)
          console.log('[Hook] AI text delta:', delta.segmentId, 'seq:', delta.seq, 'delta:', delta.delta);
          setState(prev => {
            if (delta.segmentId !== prev.currentSegmentId) {
              console.log('[Hook] Skipping delta - segment mismatch:', delta.segmentId, 'vs', prev.currentSegmentId);
              return prev;
            }
            const newDisplayed = prev.displayedText + delta.delta;
            return {
              ...prev,
              displayedText: newDisplayed,
              currentSpeech: newDisplayed,
              aiText: newDisplayed,
              aiFullText: newDisplayed,
            };
          });
        },
        onAudioEnd: (meta: AudioEndMeta) => {
          console.log('[Hook] Audio ended for segment:', meta.segmentId, 'lastSeq:', meta.lastSeq);
          // Audio finished - board will arrive next
          // Ensure full text is displayed
          setState(prev => {
            if (meta.segmentId !== prev.currentSegmentId) return prev;
            return {
              ...prev,
              displayedText: prev.currentSpeech,
              aiText: prev.currentSpeech,  // Show full text
            };
          });
        },
        onBoard: (segmentId: number, board: string) => {
          console.log('[Hook] Received board for segment:', segmentId, 'board length:', board.length, 'board preview:', board.substring(0, 100));
          // Board arrived - create complete segment and add to list
          setState(prev => {
            console.log('[Hook] onBoard setState - currentSpeech:', prev.currentSpeech?.substring(0, 50), 'existing segments:', prev.segments.length);
            const segment: Segment = {
              segment_id: segmentId,
              speech: prev.currentSpeech,
              board: board,
            };
            const newSegments = [...prev.segments, segment];
            const newBoardMarkup = newSegments.map(s => s.board).filter(b => b).join('\n\n');
            console.log('[Hook] onBoard - newBoardMarkup length:', newBoardMarkup.length);
            // Call onSegment callback with complete segment
            onSegment?.(segment);
            return {
              ...prev,
              segments: newSegments,
              boardMarkup: newBoardMarkup,
            };
          });
        },
        onAudio: (audioBase64: string, meta) => {
          const segmentId = meta?.segmentId ?? -1;
          const seq = meta?.seq;
          if (segmentId !== audioSeqRef.current.segmentId) {
            audioSeqRef.current = { segmentId, nextSeq: 0, buffer: new Map() };
          }
          if (seq === undefined) {
            audioRef.current?.queueAudio(audioBase64, {
              format: meta?.format,
              sampleRate: meta?.sampleRate,
              channels: meta?.channels,
              bitsPerSample: meta?.bitsPerSample,
            });
          } else {
            audioSeqRef.current.buffer.set(seq, audioBase64);
            while (audioSeqRef.current.buffer.has(audioSeqRef.current.nextSeq)) {
              const next = audioSeqRef.current.buffer.get(audioSeqRef.current.nextSeq);
              audioSeqRef.current.buffer.delete(audioSeqRef.current.nextSeq);
              if (next) {
                audioRef.current?.queueAudio(next, {
                  format: meta?.format,
                  sampleRate: meta?.sampleRate,
                  channels: meta?.channels,
                  bitsPerSample: meta?.bitsPerSample,
                });
              }
              audioSeqRef.current.nextSeq += 1;
            }
          }
          if (segmentId !== -1) {
            setState(prev => ({ ...prev, currentSegmentId: segmentId }));
          }
        },
        onDone: (_totalSegments: number, reason: string) => {
          console.log('[Hook] AI finished speaking', reason);
          aiSpeakingRef.current = false;
          // Auto-start listening again after AI finishes
          setState(prev => ({ ...prev, status: 'listening' }));
          startListening();
        },
        onError: (code: number, message: string) => {
          const errorMsg = `错误 ${code}: ${message}`;
          setState(prev => ({ ...prev, error: errorMsg, status: 'error' }));
          onError?.(errorMsg);
        },
        onClose: (code: number, reason: string) => {
          console.log('[Hook] WebSocket closed:', code, reason);
          // Map close reasons to user-friendly messages
          let closeMessage: string | null = null;
          if (reason === 'Listening timeout') {
            closeMessage = '由于长时间未说话，对话已自动结束';
          } else if (reason === 'Idle timeout') {
            closeMessage = '由于长时间无操作，对话已自动结束';
          } else if (reason === 'User ended conversation') {
            closeMessage = null; // User intentionally ended, no message needed
          } else if (code !== 1000) {
            closeMessage = '连接已断开，请重新开始对话';
          }

          if (closeMessage) {
            setState(prev => ({
              ...prev,
              closeReason: closeMessage,
              status: 'idle',
            }));
            onError?.(closeMessage);
          }
        },
      });

      // Connect to WebSocket
      await wsRef.current.connect();

      // Auto-start listening after connection
      if (autoConnect) {
        await startListening();
      }

    } catch (e: any) {
      console.error('[Hook] Initialize error:', e);
      const errorMsg = e.message || '初始化失败';
      setState(prev => ({ ...prev, error: errorMsg, status: 'error' }));
      onError?.(errorMsg);
    }
  }, [conversationId, wsToken, autoConnect, initialImageUrl, onConnectionChange, onError, startListening]);

  /**
   * Start listening (recording)
   */
  const startListening = useCallback(async () => {
    if (!audioRef.current) return;

    if (audioRef.current.isRecording()) {
      return;
    }

    const success = await audioRef.current.startRecording();
    if (success) {
      sequenceRef.current = 1;
      streamIdRef.current = `u${Date.now()}`;
      if (wsRef.current?.isConnected()) {
        wsRef.current.sendMicStart(streamIdRef.current);
      }
      setState(prev => ({ ...prev, status: 'listening' }));
    }
  }, []);

  /**
   * Stop listening and send audio
   */
  const stopListening = useCallback(async () => {
    if (!audioRef.current || !wsRef.current) return;

    await audioRef.current.stopRecording();
    if (wsRef.current.isConnected()) {
      const lastSeq = Math.max(0, sequenceRef.current - 1);
      if (streamIdRef.current) {
        wsRef.current.sendMicEnd(streamIdRef.current, lastSeq);
      }
      setState(prev => ({ ...prev, status: 'processing' }));
    }
  }, []);

  /**
   * Interrupt AI (stop it from speaking)
   */
  const interrupt = useCallback(async () => {
    if (!wsRef.current || !audioRef.current) return;

    console.log('[Hook] Manual interrupt');
    wsRef.current.sendInterrupt();
    await audioRef.current.stopPlayback();
    aiSpeakingRef.current = false;
    setState(prev => ({ ...prev, status: 'listening' }));

    // Start listening again
    await startListening();
  }, [startListening]);

  /**
   * Cleanup and disconnect
   */
  const disconnect = useCallback(async (reason: string = 'unknown') => {
    if (reason === 'unknown' && connectionStateRef.current === 'connected') {
      console.warn('[Hook] Ignoring disconnect without reason while connected');
      return;
    }
    console.log('[Hook] Disconnecting...', reason);

    if (audioRef.current) {
      await audioRef.current.cleanup();
      audioRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }
    streamIdRef.current = '';
    audioSeqRef.current = { segmentId: -1, nextSeq: 0, buffer: new Map() };

    setState(prev => ({
      ...prev,
      status: 'idle',
      connectionState: 'disconnected',
      isRecording: false,
      isPlaying: false,
      closeReason: null,
      currentSpeech: '',
      displayedText: '',
    }));
  }, []);

  /**
   * Clear AI text (for new conversation turn)
   */
  const clearAiText = useCallback(() => {
    setState(prev => ({ ...prev, aiText: '' }));
  }, []);

  /**
   * Clear segments and board markup (for new conversation turn)
   */
  const clearSegments = useCallback(() => {
    setState(prev => ({
      ...prev,
      segments: [],
      boardMarkup: '',
      currentSegmentId: -1,
      currentSpeech: '',
      displayedText: '',
    }));
  }, []);

  // Auto-initialize on mount
  useEffect(() => {
    if (autoConnect && conversationId && wsToken) {
      initialize();
    }

    return () => {
      disconnect('effect_cleanup');
    };
  }, [autoConnect, conversationId, wsToken, initialize, disconnect]);

  useEffect(() => {
    connectionStateRef.current = state.connectionState;
  }, [state.connectionState]);

  return {
    state,
    initialize,
    startListening,
    stopListening,
    interrupt,
    disconnect,
    clearAiText,
    clearSegments,
    isConnected: state.connectionState === 'connected',
    // Expose segment data directly for convenience
    segments: state.segments,
    boardMarkup: state.boardMarkup,
    // Expose typing effect state
    displayedText: state.displayedText,
    currentSpeech: state.currentSpeech,
  };
}
