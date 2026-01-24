/**
 * useConversation Hook
 * Combines WebSocket and Audio services for AI conversation
 * Handles the full conversation flow including voice recording, playback, and interruption
 * Supports new segment-based protocol with speech + board content
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ConversationWebSocket, ConnectionState, Segment, ConversationStateType } from '../services/websocket';
import { AudioService, RecordingState, PlaybackState } from '../services/audio';

export type ConversationStatus = 'connecting' | 'listening' | 'speaking' | 'processing' | 'error' | 'idle';

export interface ConversationState {
  status: ConversationStatus;
  connectionState: ConnectionState;
  aiText: string;           // AI's current text (for display/whiteboard)
  aiFullText: string;       // Accumulated AI text
  userText: string;         // User's transcript
  userFullText: string;     // Accumulated user transcript
  error: string | null;
  isRecording: boolean;
  isPlaying: boolean;
  // New segment-based fields
  segments: Segment[];      // All received segments
  boardMarkup: string;      // Combined board markup from all segments
  currentSegmentId: number; // Currently playing segment
  // Close reason (for showing appropriate message to user)
  closeReason: string | null;
}

// Re-export Segment type for convenience
export type { Segment } from '../services/websocket';

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
    closeReason: null,
  });

  // Refs for services
  const wsRef = useRef<ConversationWebSocket | null>(null);
  const audioRef = useRef<AudioService | null>(null);
  const sequenceRef = useRef<number>(1);
  const isPlayingRef = useRef<boolean>(false);
  const sentFramesRef = useRef<number>(0);
  const asrGateRef = useRef<boolean>(true);
  const connectionStateRef = useRef<ConnectionState>('disconnected');

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
          if (playbackState === 'playing') {
            asrGateRef.current = false;
          } else if (playbackState === 'idle' && !aiSpeakingRef.current) {
            asrGateRef.current = true;
          }
        },
        onAudioData: (base64Data: string) => {
          if (asrGateRef.current && wsRef.current?.isConnected()) {
            wsRef.current.sendAudio(base64Data, sequenceRef.current++);
            sentFramesRef.current += 1;
            if (sentFramesRef.current === 1 || sentFramesRef.current % 50 === 0) {
              console.log(`[Hook] sent audio frame=${sentFramesRef.current} bytes=${base64Data.length}`);
            }
          }
        },
        onSpeechStart: () => {
          console.log('[Hook] User started speaking');
          asrGateRef.current = true;
          // If AI is speaking, send interrupt
          if (aiSpeakingRef.current && wsRef.current?.isConnected()) {
            console.log('[Hook] Interrupting AI...');
            wsRef.current.sendInterrupt();
            audioRef.current?.stopPlayback();
            aiSpeakingRef.current = false;
          }
          setState(prev => ({ ...prev, status: 'listening' }));
        },
        onSilenceDetected: async () => {
          console.log('[Hook] User stopped speaking (silence detected)');
          asrGateRef.current = false;
          await audioRef.current?.stopRecording();
          wsRef.current?.sendEndSpeaking();
          setState(prev => ({ ...prev, status: 'processing', isRecording: false }));
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
        if (initialImageUrl) {
          wsRef.current?.sendImage(initialImageUrl);
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
        onTranscript: (text: string, isFinal: boolean) => {
          setState(prev => {
            const trimmed = text || '';
            return {
              ...prev,
              userText: trimmed,
              userFullText: isFinal ? trimmed : prev.userFullText,
              status: isFinal ? 'processing' : 'listening',
            };
          });
        },
        onSegment: (segment: Segment) => {
          console.log('[Hook] Received segment:', segment.segment_id);
          // Add segment and update board markup
          setState(prev => {
            const newSegments = [...prev.segments, segment];
            const newBoardMarkup = newSegments.map(s => s.board).join('\n\n');
            return {
              ...prev,
              segments: newSegments,
              boardMarkup: newBoardMarkup,
              aiText: segment.speech, // Current speech for display
              aiFullText: segment.speech,
            };
          });
          onSegment?.(segment);
        },
        onAudio: (audioBase64: string, meta) => {
          // Queue audio for playback (PCM streaming)
          audioRef.current?.queueAudio(audioBase64, {
            format: meta?.format,
            sampleRate: meta?.sampleRate,
            channels: meta?.channels,
            bitsPerSample: meta?.bitsPerSample,
          });
          if (meta?.segmentId !== undefined) {
            setState(prev => ({ ...prev, currentSegmentId: meta.segmentId }));
          }
        },
        onDone: () => {
          console.log('[Hook] AI finished speaking');
          aiSpeakingRef.current = false;
          asrGateRef.current = true;
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

    // Don't start if AI is speaking
    if (aiSpeakingRef.current) {
      console.log('[Hook] Cannot start listening - AI is speaking');
      return;
    }

    if (audioRef.current.isRecording()) {
      return;
    }

    const success = await audioRef.current.startRecording();
    if (success) {
      sequenceRef.current = 1;
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
      wsRef.current.sendEndSpeaking();
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

    setState(prev => ({
      ...prev,
      status: 'idle',
      connectionState: 'disconnected',
      isRecording: false,
      isPlaying: false,
      closeReason: null,
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
    setState(prev => ({ ...prev, segments: [], boardMarkup: '', currentSegmentId: -1 }));
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
  };
}
