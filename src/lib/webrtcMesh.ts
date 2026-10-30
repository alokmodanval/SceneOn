import Peer, { MediaConnection } from 'peerjs';
import { supabase, isSupabaseConfigured } from './supabase';
import { DjSoundType, RoomChatMessage, RoomParticipant } from '../types';

export type SignalMessage =
  | { type: 'join'; userId: string; alias: string; peerId: string; role?: 'host' | 'speaker' | 'listener'; seat_number?: number }
  | { type: 'leave'; userId: string; peerId: string }
  | { type: 'reaction'; userId: string; emoji: string }
  | { type: 'dj_sound'; sound: DjSoundType; senderAlias: string }
  | { type: 'room_chat'; message: RoomChatMessage }
  | { type: 'topic'; topic: string }
  | { type: 'speaking'; userId: string; isSpeaking: boolean }
  | { type: 'raise_hand'; userId: string; isRaised: boolean }
  | { type: 'seat_change'; userId: string; seat_number?: number; role: 'host' | 'speaker' | 'listener' }
  | { type: 'lock_seat'; seat_number: number; isLocked: boolean };

export interface WebRTCMeshCallbacks {
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onPeerLeave: (peerId: string, userId?: string) => void;
  onReaction: (emoji: string, senderId: string) => void;
  onDjSound?: (sound: DjSoundType, senderAlias: string) => void;
  onRoomChat?: (msg: RoomChatMessage) => void;
  onTopicChange: (topic: string) => void;
  onPeerSpeaking: (peerId: string, isSpeaking: boolean) => void;
  onPeerJoin?: (participant: Partial<RoomParticipant> & { peerId: string }) => void;
  onHandRaised?: (userId: string, isRaised: boolean) => void;
  onSeatChange?: (userId: string, seat_number?: number, role?: 'host' | 'speaker' | 'listener') => void;
  onLockSeat?: (seat_number: number, isLocked: boolean) => void;
}

export class WebRTCMeshRoom {
  private roomId: string;
  private userId: string;
  private alias: string;
  private localStream: MediaStream | null = null;
  private callbacks: WebRTCMeshCallbacks;

  // PeerJS signaling
  private peer: Peer | null = null;
  public myPeerId: string = '';
  private activeCalls: Map<string, MediaConnection> = new Map(); // targetPeerId -> call
  private remoteAudioElements: Map<string, HTMLAudioElement> = new Map();

  // Multi-tier Fallback Channels
  private realtimeChannel: any = null;
  private localBroadcastChannel: BroadcastChannel | null = null;
  private knownPeers: Map<string, { userId: string; alias: string }> = new Map(); // peerId -> info

  constructor(roomId: string, userId: string, alias: string, callbacks: WebRTCMeshCallbacks) {
    this.roomId = roomId;
    this.userId = userId;
    this.alias = alias;
    this.callbacks = callbacks;
  }

  public async start(stream: MediaStream, initialRole: 'host' | 'speaker' | 'listener' = 'speaker', initialSeat: number = 1): Promise<string> {
    this.localStream = stream;

    // Deterministic or clean Peer ID: fc_<cleanUserId>_<random4>
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
          this.myPeerId = id;
          this.initSignaling(initialRole, initialSeat);
          resolve(id);
        });

        this.peer.on('error', (err: any) => {
          console.warn('[PeerJS] Fallback/Error:', err);
          // If ID taken or failed, initialize with auto-generated ID
          if (!this.myPeerId) {
            this.peer = new Peer({
              config: {
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
              },
            });
            this.peer.on('open', (newId) => {
              this.myPeerId = newId;
              this.initSignaling(initialRole, initialSeat);
              resolve(newId);
            });
          }
        });

        // Handle incoming audio call
        this.peer.on('call', (call) => {
          if (!this.localStream) return;
          call.answer(this.localStream);
          this.setupCall(call);
        });
      } catch (err) {
        console.error('PeerJS init failed:', err);
        this.initSignaling(initialRole, initialSeat);
        resolve(candidateId);
      }
    });
  }

  private initSignaling(role: 'host' | 'speaker' | 'listener', seat_number: number) {
    // 1. Supabase Realtime Broadcast Channel
    if (isSupabaseConfigured && supabase) {
      this.realtimeChannel = supabase.channel(`voice_room_${this.roomId}`, {
        config: { broadcast: { self: false } },
      });

      this.realtimeChannel
        .on('broadcast', { event: 'signal' }, (payload: { payload: SignalMessage }) => {
          this.handleSignal(payload.payload);
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            this.broadcastSignal({
              type: 'join',
              userId: this.userId,
              alias: this.alias,
              peerId: this.myPeerId,
              role,
              seat_number,
            });
          }
        });
    }

    // 2. Local/Tab-to-Tab BroadcastChannel
    try {
      this.localBroadcastChannel = new BroadcastChannel(`sceneon_mesh_${this.roomId}`);
      this.localBroadcastChannel.onmessage = (event) => {
        if (event.data && event.data.peerId !== this.myPeerId && event.data.userId !== this.userId) {
          this.handleSignal(event.data);
        }
      };
      // Send initial announcement
      this.broadcastSignal({
        type: 'join',
        userId: this.userId,
        alias: this.alias,
        peerId: this.myPeerId,
        role,
        seat_number,
      });
    } catch (err) {
      console.warn('BroadcastChannel not supported:', err);
    }
  }

  private setupCall(call: MediaConnection) {
    this.activeCalls.set(call.peer, call);

    call.on('stream', (remoteStream) => {
      // Create/reuse audio element
      let audioEl = this.remoteAudioElements.get(call.peer);
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.autoplay = true;
        this.remoteAudioElements.set(call.peer, audioEl);
      }
      audioEl.srcObject = remoteStream;
      audioEl.play().catch(() => {});

      this.callbacks.onRemoteStream(call.peer, remoteStream);
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
    if (!this.peer || !this.localStream || this.activeCalls.has(targetPeerId) || targetPeerId === this.myPeerId) {
      return;
    }
    try {
      const call = this.peer.call(targetPeerId, this.localStream);
      this.setupCall(call);
    } catch (err) {
      console.warn('Failed to call peer:', targetPeerId, err);
    }
  }

  public updateLocalStream(newStream: MediaStream) {
    this.localStream = newStream;
    // Replace tracks on active calls
    const audioTrack = newStream.getAudioTracks()[0];
    if (!audioTrack) return;

    this.activeCalls.forEach((call) => {
      try {
        const senders = (call as any).peerConnection?.getSenders();
        const audioSender = senders?.find((s: any) => s.track?.kind === 'audio');
        if (audioSender) {
          audioSender.replaceTrack(audioTrack);
        }
      } catch (err) {
        console.warn('Track replacement error:', err);
      }
    });
  }

  private broadcastSignal(msg: SignalMessage) {
    if (this.realtimeChannel) {
      this.realtimeChannel.send({
        type: 'broadcast',
        event: 'signal',
        payload: msg,
      });
    }
    if (this.localBroadcastChannel) {
      this.localBroadcastChannel.postMessage(msg);
    }
  }

  private handleSignal(msg: SignalMessage) {
    switch (msg.type) {
      case 'join': {
        this.knownPeers.set(msg.peerId, { userId: msg.userId, alias: msg.alias });
        this.callbacks.onPeerJoin?.({
          id: msg.userId,
          alias: msg.alias,
          peerId: msg.peerId,
          role: msg.role || 'speaker',
          seat_number: msg.seat_number,
        });

        // If I have a smaller peerId or I'm earlier, connect to them
        if (this.myPeerId && msg.peerId && this.myPeerId !== msg.peerId) {
          // Avoid duplicate calls: only call if our peer ID is lexicographically greater
          if (this.myPeerId > msg.peerId) {
            setTimeout(() => this.callPeer(msg.peerId), 500);
          }
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
      text: text.trim(),
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

  public broadcastRaiseHand(isRaised: boolean) {
    this.broadcastSignal({
      type: 'raise_hand',
      userId: this.userId,
      isRaised,
    });
  }

  public broadcastSeatChange(seat_number?: number, role: 'host' | 'speaker' | 'listener' = 'speaker') {
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
    this.broadcastSignal({
      type: 'leave',
      userId: this.userId,
      peerId: this.myPeerId,
    });

    this.activeCalls.forEach((call) => call.close());
    this.activeCalls.clear();

    this.remoteAudioElements.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    this.remoteAudioElements.clear();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
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
