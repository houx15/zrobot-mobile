/**
 * WebSocket Service for AI Conversation
 * Handles real-time voice communication with the backend
 */

import { WS_BASE_URL } from '../config';

// Message types from client to server (v2 envelope)
export type ClientMessageType =
  | 'client_hello'
  | 'mic_start'
  | 'user_audio_chunk'
  | 'mic_end'
  | 'image'
  | 'interrupt'
  | 'ping';

// Message types from server to client (v2 envelope)
export type ServerMessageType =
  | 'state'
  | 'asr_partial'
  | 'asr_final'
  | 'segment_start'
  | 'ai_text_delta'
  | 'audio_chunk'
  | 'audio_end'
  | 'board'
  | 'done'
  | 'error'
  | 'pong';

// Conversation state from server
export type ConversationStateType = 'idle' | 'listening' | 'processing' | 'speaking';

// Segment containing paired speech and board content
export interface Segment {
  segment_id: number;
  speech: string;
  board: string;
}

export interface ClientEnvelope {
  type: ClientMessageType;
  conv_id: number;
  msg_id: string;
  ts_ms: number;
  payload: Record<string, any>;
}

export interface ServerEnvelope {
  type: ServerMessageType;
  conv_id: number;
  msg_id: string;
  ts_ms: number;
  payload: Record<string, any>;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface AudioMeta {
  segmentId?: number;
  format?: string;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  seq?: number;  // audio chunk sequence number
}

export interface AiTextDelta {
  segmentId: number;
  delta: string;
  seq: number;
}

export interface AudioEndMeta {
  segmentId: number;
  lastSeq: number;
}

export interface WebSocketCallbacks {
  onConnectionChange?: (state: ConnectionState) => void;
  onAsrPartial?: (text: string) => void;
  onAsrFinal?: (text: string) => void;
  onAiTextDelta?: (delta: AiTextDelta) => void;
  onAudio?: (audioBase64: string, meta?: AudioMeta) => void;
  onAudioEnd?: (meta: AudioEndMeta) => void;
  onSegmentStart?: (segmentId: number, index: number) => void;
  onBoard?: (segmentId: number, board: string) => void;
  onStateChange?: (state: ConversationStateType) => void;
  onDone?: (totalSegments: number, reason: string) => void;
  onError?: (code: number, message: string, retryable?: boolean) => void;
  onClose?: (code: number, reason: string) => void;  // Called when connection closes
}

export class ConversationWebSocket {
  private ws: WebSocket | null = null;
  private conversationId: number;
  private token: string;
  private callbacks: WebSocketCallbacks;
  private connectionState: ConnectionState = 'disconnected';
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private seq: number = 1;

  constructor(conversationId: number, token: string, callbacks: WebSocketCallbacks) {
    this.conversationId = conversationId;
    this.token = token;
    this.callbacks = callbacks;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.setConnectionState('connecting');

      const url = `${WS_BASE_URL}/${this.conversationId}?token=${this.token}`;
      console.log('[WS] Connecting to:', url);

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[WS] Connected');
        this.setConnectionState('connected');
        this.reconnectAttempts = 0;
        this.startPingInterval();
        resolve();
      };

      this.ws.onclose = (event) => {
        console.log('[WS] Closed:', event.code, event.reason);
        this.setConnectionState('disconnected');
        this.stopPingInterval();

        // Notify about close with reason
        this.callbacks.onClose?.(event.code, event.reason || '');

        // Try to reconnect if not intentionally closed
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[WS] Reconnecting... attempt ${this.reconnectAttempts}`);
          setTimeout(() => this.connect(), 2000);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        this.setConnectionState('error');
        reject(error);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect() {
    console.log('[WS] Disconnecting...');
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close(1000, 'User ended conversation');
      this.ws = null;
    }
    this.setConnectionState('disconnected');
  }

  /**
   * Send audio data to the server
   */
  sendClientHello(payload: Record<string, any>) {
    this.sendEnvelope('client_hello', payload);
  }

  sendMicStart(streamId: string) {
    this.sendEnvelope('mic_start', { stream_id: streamId });
  }

  sendAudioChunk(audioBase64: string, streamId: string, sequence?: number) {
    const seq = sequence ?? this.seq++;
    this.sendEnvelope('user_audio_chunk', {
      stream_id: streamId,
      seq,
      format: 'pcm_s16le',
      sample_rate: 16000,
      channels: 1,
      bits_per_sample: 16,
      data_b64: audioBase64,
    });
  }

  sendMicEnd(streamId: string, lastSeq: number) {
    this.sendEnvelope('mic_end', { stream_id: streamId, last_seq: lastSeq });
  }

  /**
   * Send image URL to the server
   */
  sendImage(imageUrl: string) {
    this.sendEnvelope('image', { image_url: imageUrl });
  }

  /**
   * Send interrupt signal to stop AI from speaking
   */
  sendInterrupt() {
    console.log('[WS] Sending interrupt');
    this.sendEnvelope('interrupt', {});
  }

  /**
   * Send ping to keep connection alive
   */
  private sendPing() {
    this.sendEnvelope('ping', {});
  }

  /**
   * Send message through WebSocket
   */
  private sendEnvelope(type: ClientMessageType, payload: Record<string, any>) {
    const message: ClientEnvelope = {
      type,
      conv_id: this.conversationId,
      msg_id: this.makeMsgId(),
      ts_ms: Date.now(),
      payload,
    };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send - not connected');
    }
  }

  private makeMsgId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Handle incoming messages from server
   */
  private handleMessage(data: string) {
    try {
      const message: ServerEnvelope = JSON.parse(data);
      const payload = message.payload || {};
      // Only log non-audio messages to reduce noise
      if (message.type !== 'audio_chunk' && message.type !== 'ai_text_delta') {
        console.log('[WS] Received:', message.type);
      }

      switch (message.type) {
        case 'state':
          // Conversation state changed
          if (payload.state) {
            this.callbacks.onStateChange?.(payload.state);
          }
          break;

        case 'asr_partial':
          this.callbacks.onAsrPartial?.(payload.text || '');
          break;

        case 'asr_final':
          this.callbacks.onAsrFinal?.(payload.text || '');
          break;

        case 'segment_start':
          // Segment begins (speech only, board comes later)
          if (payload.segment_id !== undefined) {
            this.callbacks.onSegmentStart?.(
              payload.segment_id,
              payload.index || 0
            );
          }
          break;

        case 'ai_text_delta':
          if (payload.segment_id !== undefined) {
            this.callbacks.onAiTextDelta?.({
              segmentId: payload.segment_id,
              delta: payload.delta || '',
              seq: payload.seq || 0,
            });
          }
          break;

        case 'board':
          // Board content (sent after audio ends)
          if (payload.segment_id !== undefined) {
            this.callbacks.onBoard?.(
              payload.segment_id,
              payload.content || ''
            );
          }
          break;

        case 'audio_chunk':
          // TTS audio data
          this.callbacks.onAudio?.(payload.data_b64 || '', {
            segmentId: payload.segment_id,
            format: payload.format,
            sampleRate: payload.sample_rate,
            channels: payload.channels,
            bitsPerSample: payload.bits_per_sample,
            seq: payload.seq,
          });
          break;

        case 'audio_end':
          // Audio stream ended for segment
          if (payload.segment_id !== undefined) {
            this.callbacks.onAudioEnd?.({
              segmentId: payload.segment_id,
              lastSeq: payload.last_seq || 0,
            });
          }
          break;

        case 'done':
          // AI finished replying
          this.callbacks.onDone?.(
            payload.total_segments || 0,
            payload.reason || 'completed'
          );
          break;

        case 'error':
          // Error from server
          this.callbacks.onError?.(
            payload.code || 5001,
            payload.message || 'Unknown error',
            payload.retryable
          );
          break;

        case 'pong':
          // Heartbeat response
          break;

        default:
          console.warn('[WS] Unknown message type:', message.type);
      }
    } catch (e) {
      console.error('[WS] Failed to parse message:', e);
    }
  }

  /**
   * Update connection state and notify callback
   */
  private setConnectionState(state: ConnectionState) {
    this.connectionState = state;
    this.callbacks.onConnectionChange?.(state);
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval() {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === 'connected';
  }
}
