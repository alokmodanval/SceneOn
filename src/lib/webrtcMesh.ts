import Peer, { MediaConnection } from 'peerjs';
import { supabase, isSupabaseConfigured } from './supabase';
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
    }
  | { type: 'leave'; userId: string; peerId: string }
  | { type: 'reaction'; userId: string; emoji: string }
  | { type: 'dj_sound'; sound: DjSoundType; senderAlias: string }
  | { type: 'room_chat'; message: RoomChatMessage }
  | { type: 'topic'; topic: string }
  | { type: 'speaking'; userId: string; isSpeaking: boolean }
  | { type: 'mute_state'; userId: string; isMuted: boolean }
  | { type: 'raise_hand'; userId: string; isRaised: boolean }
  | { type: 'seat_change'; userId: string; seat_number?: number; role: 'host' | 'speaker' | 'listener' }
  | { type: 'lock_seat'; seat_number: number; isLocked: boolean }
  | { type: 'speed_verdict'; userId: string; verdict: 'w_scene' | 'pass' };

export interface WebRTCMeshCallbacks {
  onRemoteStream: (peerId: string, stream: MediaStream, userId?: string) => void;
  onPeerLeave: (peerId: string, userId?: string) => void;
  onReaction: (emoji: string, senderId: string) => void;
  onDjSound?: (sound: DjSoundType, senderAlias: string) => void;
  onRoomChat?: (msg: RoomChatMessage) => void;
  onTopicChange: (topic: string) => void;
  onPeerSpeaking: (userId: string, isSpeaking: boolean) => void;
  onPeerJoin?: (participant: Partial<RoomParticipant> & { peerId: string }) => void;
  onPeerMuteChange?: (userId: string, isMuted: boolean) => void;
  onHandRaised?: (userId: string, isRaised: boolean) => void;
  onSeatChange?: (userId: string, seat_number?: number, role?: 'host' | 'speaker' | 'listener') => void;
  onLockSeat?: (seat_number: number, isLocked: boolean) => void;
  onSpeedVerdict?: (userId: string, verdict: 'w_scene' | 'pass') => void;
}

export class WebRTCMeshRoom {
  private roomId: string;
  private userId: string;
  private alias: string;
  private localStream: MediaStream | null = null;
  private callbacks: WebRTCMeshCallbacks;

  // Peer metadata preserved for join_ack responses
  private myRole: 'host' | 'speaker' | 'listener' = 'speaker';
  private mySeat: number | undefined = 1;
  private myAvatar?: UserAvatar;
  private myMuted: boolean = true;

  // PeerJS signaling
  private peer: Peer | null = null;
  public myPeerId: string = '';
  private activeCalls: Map<string, MediaConnection> = new Map();
  private remoteAudioElements: Map<string, HTMLAudioElement> = new Map();

  // Multi-tier Fallback Channels
  private realtimeChannel: any = null;
  private localBroadcastChannel: BroadcastChannel | null = null;
  private knownPeers: Map<string, { userId: string; alias: string }> = new Map();
  private isDestroyed = false;

  constructor(
    roomId: string,
    userId: string,
    alias: string,
    callbacks: WebRTCMeshCallbacks,
    avatar?: UserAvatar,
    initialMuted = true
  ) {
    this.roomId = roomId;
    this.userId = userId;
    this.alias = alias;
    this.callbacks = callbacks;
    this.myAvatar = avatar;
    this.myMuted = initialMuted;
  }

  public async start(
    stream: MediaStream,
    initialRole: 'host' | 'speaker' | 'listener' = 'speaker',
    initialSeat: number | undefined = 1
  ): Promise<string> {
    this.localStream = stream;
    this.myRole = initialRole;
    this.mySeat = initialSeat;

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

  private initSignaling() {
    if (this.isDestroyed) return;

    const joinPayload: SignalMessage = {
      type: 'join',
      userId: this.userId,
      alias: this.alias,
      peerId: this.myPeerId,
      role: this.myRole,
      seat_number: this.mySeat,
      avatar: this.myAvatar,
      is_muted: this.myMuted,
    };

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
          this.handleSignal(event.data);
        }
      };
      this.localBroadcastChannel.postMessage(joinPayload);
    } catch {
      // BroadcastChannel unavailable
    }
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
      audioEl.srcObject = remoteStream;
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
        console.warn('Track replacement error:', err);
      }
    });
  }

  private broadcastSignal(msg: SignalMessage) {
    if (this.isDestroyed) return;
    if (this.realtimeChannel) {
      this.realtimeChannel.send({
        type: 'broadcast',
        event: 'signal',
        payload: msg,
      });
    }
    if (this.localBroadcastChannel) {
      try {
        this.localBroadcastChannel.postMessage(msg);
      } catch {
        // Ignore closed channel
      }
    }
  }

  private handleSignal(msg: SignalMessage) {
    if (this.isDestroyed) return;

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
        });

        // Acknowledge presence so late joiners see existing peers & initiate WebRTC bidirectionally
        this.broadcastSignal({
          type: 'join_ack',
          userId: this.userId,
          alias: this.alias,
          peerId: this.myPeerId,
          role: this.myRole,
          seat_number: this.mySeat,
          avatar: this.myAvatar,
          is_muted: this.myMuted,
        });

        if (this.myPeerId && msg.peerId && this.myPeerId > msg.peerId) {
          setTimeout(() => this.callPeer(msg.peerId), 400);
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
          });
        }

        if (this.myPeerId && msg.peerId && this.myPeerId > msg.peerId) {
          setTimeout(() => this.callPeer(msg.peerId), 400);
        }
        break;
      }
      case 'leave': {
        this.cleanupCall(msg.peerId);
        this.knownPeers.delete(msg.peerId);
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
