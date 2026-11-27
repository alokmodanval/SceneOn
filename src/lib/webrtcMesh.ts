import Peer, { MediaConnection } from 'peerjs';
import { supabase, isSupabaseConfigured } from './supabase';
import { buildWsUrl } from './backendConfig';
import { DjSoundType, RoomChatMessage, RoomParticipant, UserAvatar } from '../types';

export type SignalMessage =
  | {
      type: 'join';
      userId: string;
      alias: string;
      peerId: string;
      role?: 'host' | 'speaker' | 'listener';
      seat_number?: number;
      avatar?: UserAvatar;
      is_muted?: boolean;
      is_camera_on?: boolean;
      _sigId?: string;
    }
  | {
      type: 'join_ack';
      userId: string;
      alias: string;
      peerId: string;
      role?: 'host' | 'speaker' | 'listener';
      seat_number?: number;
      avatar?: UserAvatar;
      is_muted?: boolean;
      is_camera_on?: boolean;
      _sigId?: string;
    }
  | { type: 'leave'; userId: string; peerId: string; _sigId?: string }
  | { type: 'reaction'; userId: string; emoji: string; _sigId?: string }
  | { type: 'dj_sound'; sound: DjSoundType; senderAlias: string; _sigId?: string }
  | { type: 'room_chat'; message: RoomChatMessage; _sigId?: string }
  | { type: 'topic'; topic: string; _sigId?: string }
  | { type: 'speaking'; userId: string; isSpeaking: boolean; _sigId?: string }
  | { type: 'mute_state'; userId: string; isMuted: boolean; _sigId?: string }
  | { type: 'camera_state'; userId: string; isCameraOn: boolean; _sigId?: string }
  | { type: 'raise_hand'; userId: string; isRaised: boolean; _sigId?: string }
  | { type: 'seat_change'; userId: string; seat_number?: number; role: 'host' | 'speaker' | 'listener'; _sigId?: string }
  | { type: 'lock_seat'; seat_number: number; isLocked: boolean; _sigId?: string }
  | { type: 'speed_verdict'; userId: string; verdict: 'w_scene' | 'pass'; _sigId?: string };

export interface WebRTCMeshCallbacks {
  onRemoteStream: (peerId: string, stream: MediaStream, userId?: string) => void;
  onPeerLeave: (peerId: string, userId?: string) => void;
  onReaction: (emoji: string, senderId: string) => void;
  onDjSound?: (sound: DjSoundType, senderAlias: string) => void;
  onRoomChat?: (msg: RoomChatMessage) => void;
  onTopicChange: (topic: string) => void;
  onPeerSpeaking: (userId: string, isSpeaking: boolean) => void;
  onPeerJoin?: (participant: Partial<RoomParticipant> & { peerId: string; is_camera_on?: boolean }) => void;
  onPeerMuteChange?: (userId: string, isMuted: boolean) => void;
  onPeerCameraChange?: (userId: string, isCameraOn: boolean) => void;
  onHandRaised?: (userId: string, isRaised: boolean) => void;
  onSeatChange?: (userId: string, seat_number?: number, role?: 'host' | 'speaker' | 'listener') => void;
  onLockSeat?: (seat_number: number, isLocked: boolean) => void;
  onSpeedVerdict?: (userId: string, verdict: 'w_scene' | 'pass') => void;
  onRawMessage?: (msg: Record<string, unknown>) => void;
  onSocketStatus?: (connected: boolean) => void;
}

export interface WebRTCMeshOptions {
  wsPath?: string;
  enableVideoSlot?: boolean;
  initialCameraOn?: boolean;
}

export function createBlankVideoTrack(): MediaStreamTrack | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#070709';
      ctx.fillRect(0, 0, 4, 4);
    }
    const stream = canvas.captureStream(1);
    const track = stream.getVideoTracks()[0] || null;
    if (track) track.enabled = false;
    return track;
  } catch {
    return null;
  }
}

export class WebRTCMeshRoom {
  private roomId: string;
  private userId: string;
  private alias: string;
  private localStream: MediaStream | null = null;
  private callbacks: WebRTCMeshCallbacks;
  private wsPath?: string;
  private enableVideoSlot = false;
  private blankVideoTrack: MediaStreamTrack | null = null;

  // Peer metadata preserved for join_ack responses
  private myRole: 'host' | 'speaker' | 'listener' = 'speaker';
  private mySeat: number | undefined = 1;
  private myAvatar?: UserAvatar;
  private myMuted = true;
  private myCameraOn = false;

  // PeerJS signaling
  private peer: Peer | null = null;
  public myPeerId = '';
  private activeCalls: Map<string, MediaConnection> = new Map();
  private remoteAudioElements: Map<string, HTMLAudioElement> = new Map();

  // Signaling transports: Durable Object WebSocket -> BroadcastChannel / Supabase fallback
  private ws: WebSocket | null = null;
  private wsPingTimer: number | null = null;
  private wsReconnectTimer: number | null = null;
  private realtimeChannel: any = null;
  private localBroadcastChannel: BroadcastChannel | null = null;
  private knownPeers: Map<string, { userId: string; alias: string }> = new Map();
  private seenSignalIds = new Set<string>();
  private queuedRawMessages: string[] = [];
  private isDestroyed = false;

  constructor(
    roomId: string,
    userId: string,
    alias: string,
    callbacks: WebRTCMeshCallbacks,
    avatar?: UserAvatar,
    initialMuted = true,
    options?: WebRTCMeshOptions
  ) {
    this.roomId = roomId;
    this.userId = userId;
    this.alias = alias;
    this.callbacks = callbacks;
    this.myAvatar = avatar;
    this.myMuted = initialMuted;
    this.wsPath = options?.wsPath;
    this.enableVideoSlot = Boolean(options?.enableVideoSlot);
    this.myCameraOn = Boolean(options?.initialCameraOn);
  }

  public async start(
    stream: MediaStream,
    initialRole: 'host' | 'speaker' | 'listener' = 'speaker',
    initialSeat: number | undefined = 1
  ): Promise<string> {
    this.localStream = stream;
    if (this.enableVideoSlot && stream.getVideoTracks().length === 0) {
      this.blankVideoTrack = createBlankVideoTrack();
      if (this.blankVideoTrack) {
        this.localStream.addTrack(this.blankVideoTrack);
      }
    }

    this.myRole = initialRole;
    this.mySeat = initialSeat;

    // Open Durable Object WebSocket immediately (does not block on external PeerJS handshake)
    this.connectRoomWebSocket();

    const cleanId = this.userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
    const candidateId = `fc_${cleanId}_${Math.random().toString(36).substring(2, 6)}`;

    return new Promise((resolve) => {
      try {
        this.peer = new Peer(candidateId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
            ],
          },
        });

        this.peer.on('open', (id) => {
          if (this.isDestroyed) {
            this.peer?.destroy();
            resolve(id);
            return;
          }
          this.myPeerId = id;
          this.initSignaling();
          resolve(id);
        });

        this.peer.on('error', (err: unknown) => {
          console.warn('[PeerJS] Fallback/Error:', err);
          if (!this.myPeerId && !this.isDestroyed) {
            try {
              this.peer = new Peer({
                config: {
                  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
                },
              });
              this.peer.on('open', (newId) => {
                if (this.isDestroyed) {
                  this.peer?.destroy();
                  resolve(newId);
                  return;
                }
                this.myPeerId = newId;
                this.initSignaling();
                resolve(newId);
              });
            } catch {
              this.myPeerId = candidateId;
              this.initSignaling();
              resolve(candidateId);
            }
          }
        });

        this.peer.on('call', (call) => {
          if (!this.localStream || this.isDestroyed) return;
          call.answer(this.localStream);
          this.setupCall(call);
        });
      } catch (err) {
        console.error('PeerJS init failed:', err);
        this.myPeerId = candidateId;
        this.initSignaling();
        resolve(candidateId);
      }
    });
  }

  private getJoinPayload(): SignalMessage {
    return {
      type: 'join',
      userId: this.userId,
      alias: this.alias,
      peerId: this.myPeerId,
      role: this.myRole,
      seat_number: this.mySeat,
      avatar: this.myAvatar,
      is_muted: this.myMuted,
      is_camera_on: this.myCameraOn,
    };
  }

  private connectRoomWebSocket() {
    if (typeof window === 'undefined' || this.isDestroyed) return;
    const path = this.wsPath || `/ws/room/${encodeURIComponent(this.roomId)}`;
    const url = buildWsUrl(path, {
      userId: this.userId,
      alias: this.alias,
      mode: this.enableVideoSlot ? 'chess' : 'room',
    });

    try {
      const socket = new WebSocket(url);
      this.ws = socket;

      socket.onopen = () => {
        if (this.isDestroyed) {
          socket.close();
          return;
        }
        this.callbacks.onSocketStatus?.(true);
        // Send join announcement across Durable Object room once PeerJS ID is ready
        if (this.myPeerId) {
          this.sendOverWs(this.getJoinPayload());
        }
        // Flush queued custom JSON (such as chess_join)
        while (this.queuedRawMessages.length > 0) {
          const item = this.queuedRawMessages.shift();
          if (item) socket.send(item);
        }
        if (this.wsPingTimer) window.clearInterval(this.wsPingTimer);
        this.wsPingTimer = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      socket.onmessage = (event) => {
        if (this.isDestroyed) return;
        try {
          const data = JSON.parse(String(event.data)) as Record<string, unknown>;
          if (data.type === 'pong') return;
          this.callbacks.onRawMessage?.(data);
          if (typeof data.type === 'string' && this.isKnownSignalType(data.type)) {
            this.handleSignal(data as unknown as SignalMessage);
          }
        } catch {
          // Ignore malformed payload
        }
      };

      socket.onclose = () => {
        this.callbacks.onSocketStatus?.(false);
        if (this.wsPingTimer) {
          window.clearInterval(this.wsPingTimer);
          this.wsPingTimer = null;
        }
        if (this.ws === socket) this.ws = null;
        if (!this.isDestroyed && !this.wsReconnectTimer) {
          this.wsReconnectTimer = window.setTimeout(() => {
            this.wsReconnectTimer = null;
            this.connectRoomWebSocket();
          }, 2500);
        }
      };

      socket.onerror = () => {
        // Fallback transports handle signaling gracefully if WS unavailable
      };
    } catch {
      // Ignore WS creation errors
    }
  }

  private initSignaling() {
    if (this.isDestroyed) return;
    const joinPayload = this.getJoinPayload();

    if (!this.ws) {
      this.connectRoomWebSocket();
    } else {
      this.sendOverWs(joinPayload);
    }

    if (isSupabaseConfigured && supabase) {
      this.realtimeChannel = supabase.channel(`voice_room_${this.roomId}`, {
        config: { broadcast: { self: false } },
      });

      this.realtimeChannel
        .on('broadcast', { event: 'signal' }, (payload: { payload: SignalMessage }) => {
          this.handleSignal(payload.payload);
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED' && !this.isDestroyed) {
            this.broadcastSignal(joinPayload);
          }
        });
    }

    try {
      this.localBroadcastChannel = new BroadcastChannel(`sceneon_mesh_${this.roomId}`);
      this.localBroadcastChannel.onmessage = (event) => {
        if (event.data && event.data.peerId !== this.myPeerId && event.data.userId !== this.userId) {
          if (typeof event.data.type === 'string') {
            this.callbacks.onRawMessage?.(event.data);
            if (this.isKnownSignalType(event.data.type)) {
              this.handleSignal(event.data);
            }
          }
        }
      };
      this.localBroadcastChannel.postMessage(joinPayload);
    } catch {
      // BroadcastChannel unavailable
    }
  }

  private isKnownSignalType(type: string): boolean {
    return [
      'join',
      'join_ack',
      'leave',
      'reaction',
      'dj_sound',
      'room_chat',
      'topic',
      'speaking',
      'mute_state',
      'camera_state',
      'raise_hand',
      'seat_change',
      'lock_seat',
      'speed_verdict',
    ].includes(type);
  }

  private setupCall(call: MediaConnection) {
    this.activeCalls.set(call.peer, call);

    call.on('stream', (remoteStream) => {
      let audioEl = this.remoteAudioElements.get(call.peer);
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.autoplay = true;
        (audioEl as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
        this.remoteAudioElements.set(call.peer, audioEl);
      }
      const audioTracks = remoteStream.getAudioTracks();
      audioEl.srcObject = audioTracks.length > 0 ? new MediaStream(audioTracks) : remoteStream;
      audioEl.play().catch(() => {});

      const mappedUserId = this.knownPeers.get(call.peer)?.userId;
      this.callbacks.onRemoteStream(call.peer, remoteStream, mappedUserId);
    });

    call.on('close', () => {
      this.cleanupCall(call.peer);
    });

    call.on('error', (err) => {
      console.warn('[PeerJS Call Error]', err);
      this.cleanupCall(call.peer);
    });
  }

  private callPeer(targetPeerId: string) {
    if (
      this.isDestroyed ||
      !this.peer ||
      !this.localStream ||
      this.activeCalls.has(targetPeerId) ||
      targetPeerId === this.myPeerId
    ) {
      return;
    }
    try {
      const call = this.peer.call(targetPeerId, this.localStream);
      if (call) {
        this.setupCall(call);
      }
    } catch (err) {
      console.warn('Failed to call peer:', targetPeerId, err);
    }
  }

  public updateLocalStream(newStream: MediaStream) {
    this.localStream = newStream;
    if (this.enableVideoSlot && newStream.getVideoTracks().length === 0) {
      if (!this.blankVideoTrack || this.blankVideoTrack.readyState === 'ended') {
        this.blankVideoTrack = createBlankVideoTrack();
      }
      if (this.blankVideoTrack) {
        this.localStream.addTrack(this.blankVideoTrack);
      }
    }

    const audioTrack = newStream.getAudioTracks()[0];
    if (!audioTrack) return;

    this.activeCalls.forEach((call) => {
      try {
        const senders = (call as unknown as { peerConnection?: RTCPeerConnection }).peerConnection?.getSenders();
        const audioSender = senders?.find((s) => s.track?.kind === 'audio');
        if (audioSender) {
          audioSender.replaceTrack(audioTrack).catch(() => {});
        }
      } catch (err) {
        console.warn('Audio track replacement error:', err);
      }
    });
  }

  public async setLocalVideoTrack(videoTrack: MediaStreamTrack | null) {
    if (!this.localStream) return;

    const existingVideo = this.localStream.getVideoTracks();
    existingVideo.forEach((t) => {
      if (t !== this.blankVideoTrack) {
        this.localStream?.removeTrack(t);
      }
    });

    let targetTrack = videoTrack;
    if (!targetTrack) {
      if (!this.blankVideoTrack || this.blankVideoTrack.readyState === 'ended') {
        this.blankVideoTrack = createBlankVideoTrack();
      }
      targetTrack = this.blankVideoTrack;
      if (targetTrack && !this.localStream.getVideoTracks().includes(targetTrack)) {
        this.localStream.addTrack(targetTrack);
      }
    } else {
      if (this.blankVideoTrack && this.localStream.getVideoTracks().includes(this.blankVideoTrack)) {
        this.localStream.removeTrack(this.blankVideoTrack);
      }
      this.localStream.addTrack(targetTrack);
    }

    const promises: Promise<void>[] = [];
    this.activeCalls.forEach((call) => {
      try {
        const pc = (call as unknown as { peerConnection?: RTCPeerConnection }).peerConnection;
        const videoSender = pc?.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender && targetTrack) {
          promises.push(videoSender.replaceTrack(targetTrack).catch(() => {}));
        }
      } catch {
        // Ignore replacement failures on closing peers
      }
    });
    await Promise.all(promises);
    this.broadcastCameraState(Boolean(videoTrack));
  }

  public sendCustomJson(payload: Record<string, unknown>) {
    if (this.isDestroyed) return;
    const raw = JSON.stringify(payload);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
    } else {
      this.queuedRawMessages.push(raw);
    }
    if (this.localBroadcastChannel) {
      try {
        this.localBroadcastChannel.postMessage(payload);
      } catch {
        // Ignore
      }
    }
  }

  private sendOverWs(payload: SignalMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch {
        // Ignore
      }
    }
  }

  private broadcastSignal(msg: SignalMessage) {
    if (this.isDestroyed) return;
    const stamped: SignalMessage = msg._sigId
      ? msg
      : {
          ...msg,
          _sigId: `${this.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        };

    this.sendOverWs(stamped);

    if (this.realtimeChannel) {
      this.realtimeChannel.send({
        type: 'broadcast',
        event: 'signal',
        payload: stamped,
      });
    }
    if (this.localBroadcastChannel) {
      try {
        this.localBroadcastChannel.postMessage(stamped);
      } catch {
        // Ignore closed channel
      }
    }
  }

  private handleSignal(msg: SignalMessage) {
    if (this.isDestroyed) return;
    if ('userId' in msg && msg.userId === this.userId && msg.type !== 'leave') return;

    if (msg._sigId) {
      if (this.seenSignalIds.has(msg._sigId)) return;
      this.seenSignalIds.add(msg._sigId);
      if (this.seenSignalIds.size > 250) {
        const first = this.seenSignalIds.values().next().value;
        if (first) this.seenSignalIds.delete(first);
      }
    }

    switch (msg.type) {
      case 'join': {
        this.knownPeers.set(msg.peerId, { userId: msg.userId, alias: msg.alias });
        this.callbacks.onPeerJoin?.({
          id: msg.userId,
          alias: msg.alias,
          peerId: msg.peerId,
          role: msg.role || 'speaker',
          seat_number: msg.seat_number,
          avatar: msg.avatar,
          is_muted: msg.is_muted ?? true,
          is_camera_on: msg.is_camera_on ?? false,
        });

        this.broadcastSignal({
          type: 'join_ack',
          userId: this.userId,
          alias: this.alias,
          peerId: this.myPeerId,
          role: this.myRole,
          seat_number: this.mySeat,
          avatar: this.myAvatar,
          is_muted: this.myMuted,
          is_camera_on: this.myCameraOn,
        });

        if (this.myPeerId && msg.peerId && this.myPeerId > msg.peerId) {
          setTimeout(() => this.callPeer(msg.peerId), 350);
        }
        break;
      }
      case 'join_ack': {
        const alreadyKnown = this.knownPeers.has(msg.peerId);
        this.knownPeers.set(msg.peerId, { userId: msg.userId, alias: msg.alias });
        if (!alreadyKnown) {
          this.callbacks.onPeerJoin?.({
            id: msg.userId,
            alias: msg.alias,
            peerId: msg.peerId,
            role: msg.role || 'speaker',
            seat_number: msg.seat_number,
            avatar: msg.avatar,
            is_muted: msg.is_muted ?? true,
            is_camera_on: msg.is_camera_on ?? false,
          });
        }

        if (this.myPeerId && msg.peerId && this.myPeerId > msg.peerId) {
          setTimeout(() => this.callPeer(msg.peerId), 350);
        }
        break;
      }
      case 'leave': {
        if (msg.peerId) {
          this.cleanupCall(msg.peerId);
          this.knownPeers.delete(msg.peerId);
        } else {
          for (const [peerId, info] of this.knownPeers.entries()) {
            if (info.userId === msg.userId) {
              this.cleanupCall(peerId);
              this.knownPeers.delete(peerId);
            }
          }
        }
        this.callbacks.onPeerLeave(msg.peerId, msg.userId);
        break;
      }
      case 'reaction': {
        this.callbacks.onReaction(msg.emoji, msg.userId);
        break;
      }
      case 'dj_sound': {
        this.callbacks.onDjSound?.(msg.sound, msg.senderAlias);
        break;
      }
      case 'room_chat': {
        this.callbacks.onRoomChat?.(msg.message);
        break;
      }
      case 'topic': {
        this.callbacks.onTopicChange(msg.topic);
        break;
      }
      case 'speaking': {
        this.callbacks.onPeerSpeaking(msg.userId, msg.isSpeaking);
        break;
      }
      case 'mute_state': {
        this.callbacks.onPeerMuteChange?.(msg.userId, msg.isMuted);
        break;
      }
      case 'camera_state': {
        this.callbacks.onPeerCameraChange?.(msg.userId, msg.isCameraOn);
        break;
      }
      case 'raise_hand': {
        this.callbacks.onHandRaised?.(msg.userId, msg.isRaised);
        break;
      }
      case 'seat_change': {
        this.callbacks.onSeatChange?.(msg.userId, msg.seat_number, msg.role);
        break;
      }
      case 'lock_seat': {
        this.callbacks.onLockSeat?.(msg.seat_number, msg.isLocked);
        break;
      }
      case 'speed_verdict': {
        this.callbacks.onSpeedVerdict?.(msg.userId, msg.verdict);
        break;
      }
    }
  }

  public sendReaction(emoji: string) {
    this.broadcastSignal({
      type: 'reaction',
      userId: this.userId,
      emoji,
    });
  }

  public sendDjSound(sound: DjSoundType) {
    this.broadcastSignal({
      type: 'dj_sound',
      sound,
      senderAlias: this.alias,
    });
  }

  public sendRoomChatMessage(text: string) {
    const msg: RoomChatMessage = {
      id: `rc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender_id: this.userId,
      sender_alias: this.alias,
      text: text.trim().slice(0, 300),
      created_at: new Date().toISOString(),
    };
    this.broadcastSignal({
      type: 'room_chat',
      message: msg,
    });
    return msg;
  }

  public broadcastTopic(topic: string) {
    this.broadcastSignal({
      type: 'topic',
      topic,
    });
  }

  public broadcastSpeaking(isSpeaking: boolean) {
    this.broadcastSignal({
      type: 'speaking',
      userId: this.userId,
      isSpeaking,
    });
  }

  public broadcastMuteState(isMuted: boolean) {
    this.myMuted = isMuted;
    this.broadcastSignal({
      type: 'mute_state',
      userId: this.userId,
      isMuted,
    });
  }

  public broadcastCameraState(isCameraOn: boolean) {
    this.myCameraOn = isCameraOn;
    this.broadcastSignal({
      type: 'camera_state',
      userId: this.userId,
      isCameraOn,
    });
  }

  public broadcastRaiseHand(isRaised: boolean) {
    this.broadcastSignal({
      type: 'raise_hand',
      userId: this.userId,
      isRaised,
    });
  }

  public broadcastSeatChange(seat_number?: number, role: 'host' | 'speaker' | 'listener' = 'speaker') {
    this.mySeat = seat_number;
    this.myRole = role;
    this.broadcastSignal({
      type: 'seat_change',
      userId: this.userId,
      seat_number,
      role,
    });
  }

  public broadcastLockSeat(seat_number: number, isLocked: boolean) {
    this.broadcastSignal({
      type: 'lock_seat',
      seat_number,
      isLocked,
    });
  }

  public broadcastSpeedVerdict(verdict: 'w_scene' | 'pass') {
    this.broadcastSignal({
      type: 'speed_verdict',
      userId: this.userId,
      verdict,
    });
  }

  private cleanupCall(peerId: string) {
    const call = this.activeCalls.get(peerId);
    if (call) {
      call.close();
      this.activeCalls.delete(peerId);
    }
    const audioEl = this.remoteAudioElements.get(peerId);
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
      this.remoteAudioElements.delete(peerId);
    }
  }

  public leave() {
    if (this.isDestroyed) return;
    this.broadcastSignal({
      type: 'leave',
      userId: this.userId,
      peerId: this.myPeerId,
    });
    this.isDestroyed = true;

    if (this.wsPingTimer) {
      window.clearInterval(this.wsPingTimer);
      this.wsPingTimer = null;
    }
    if (this.wsReconnectTimer) {
      window.clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }

    if (this.blankVideoTrack) {
      try {
        this.blankVideoTrack.stop();
      } catch {
        // Ignore
      }
      this.blankVideoTrack = null;
    }

    this.activeCalls.forEach((call) => call.close());
    this.activeCalls.clear();
    this.knownPeers.clear();

    this.remoteAudioElements.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    this.remoteAudioElements.clear();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore peer cleanup error
      }
      this.peer = null;
    }

    if (this.realtimeChannel && supabase) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    if (this.localBroadcastChannel) {
      this.localBroadcastChannel.close();
      this.localBroadcastChannel = null;
    }
  }
}
