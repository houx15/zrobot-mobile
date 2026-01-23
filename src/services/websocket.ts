/**
 * WebSocket Service for AI Conversation
 * Handles real-time voice communication with the backend
 */

import { WS_BASE_URL } from '../config';

// Message types from client to server
export type ClientMessageType = 'audio' | 'end_speaking' | 'image' | 'interrupt' | 'ping';

// Message types from server to client
export type ServerMessageType = 'audio' | 'transcript' | 'segment' | 'state' | 'done' | 'error' | 'pong';

// Conversation state from server
export type ConversationStateType = 'idle' | 'listening' | 'processing' | 'speaking';

// Segment containing paired speech and board content
export interface Segment {
  segment_id: number;
  speech: string;
  board: string;
}

export interface ClientMessage {
  type: ClientMessageType;
  data: {
    audio?: string;      // base64 encoded PCM audio
    sequence?: number;
    image_url?: string;  // image URL
  };
  timestamp: string;
}

export interface ServerMessage {
  type: ServerMessageType;
  data: {
    audio?: string;      // base64 encoded audio from TTS
    text?: string;       // transcript text
    is_final?: boolean;  // true for final ASR result
    total_segments?: number;
    code?: number;       // error code
    message?: string;    // error message
    state?: ConversationStateType;  // conversation state
    // Segment fields
    segment_id?: number;
    speech?: string;
    board?: string;
  };
  timestamp: string;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketCallbacks {
  onConnectionChange?: (state: ConnectionState) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAudio?: (audioBase64: string, segmentId?: number) => void;
  onSegment?: (segment: Segment) => void;
  onStateChange?: (state: ConversationStateType) => void;
  onDone?: (totalSegments: number) => void;
  onError?: (code: number, message: string) => void;
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
  sendAudio(audioBase64: string, sequence: number) {
    this.send({
      type: 'audio',
      data: { audio: audioBase64, sequence },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send end speaking signal
   */
  sendEndSpeaking() {
    this.send({
      type: 'end_speaking',
      data: {},
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send image URL to the server
   */
  sendImage(imageUrl: string) {
    this.send({
      type: 'image',
      data: { image_url: imageUrl },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send interrupt signal to stop AI from speaking
   */
  sendInterrupt() {
    console.log('[WS] Sending interrupt');
    this.send({
      type: 'interrupt',
      data: {},
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send ping to keep connection alive
   */
  private sendPing() {
    this.send({
      type: 'ping',
      data: {},
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send message through WebSocket
   */
  private send(message: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send - not connected');
    }
  }

  /**
   * Handle incoming messages from server
   */
  private handleMessage(data: string) {
    try {
      const message: ServerMessage = JSON.parse(data);
      console.log('[WS] Received:', message.type);

      switch (message.type) {
        case 'state':
          // Conversation state changed
          if (message.data.state) {
            this.callbacks.onStateChange?.(message.data.state);
          }
          break;

        case 'transcript':
          // ASR recognition result
          this.callbacks.onTranscript?.(
            message.data.text || '',
            message.data.is_final || false
          );
          break;

        case 'segment':
          // New segment with speech + board content
          if (message.data.segment_id !== undefined) {
            const segment: Segment = {
              segment_id: message.data.segment_id,
              speech: message.data.speech || '',
              board: message.data.board || '',
            };
            this.callbacks.onSegment?.(segment);
          }
          break;

        case 'audio':
          // TTS audio data
          this.callbacks.onAudio?.(message.data.audio || '', message.data.segment_id);
          break;

        case 'done':
          // AI finished replying
          this.callbacks.onDone?.(message.data.total_segments || 0);
          break;

        case 'error':
          // Error from server
          this.callbacks.onError?.(
            message.data.code || 5001,
            message.data.message || 'Unknown error'
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
