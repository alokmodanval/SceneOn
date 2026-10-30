import { supabase, isSupabaseConfigured } from './supabase';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export type SignalMessage =
  | { type: 'join'; userId: string; alias: string }
  | { type: 'offer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: 'candidate'; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: 'leave'; userId: string }
  | { type: 'reaction'; userId: string; emoji: string }
  | { type: 'topic'; topic: string }
  | { type: 'speaking'; userId: string; isSpeaking: boolean };

export interface WebRTCMeshCallbacks {
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onPeerLeave: (peerId: string) => void;
  onReaction: (emoji: string, senderId: string) => void;
  onTopicChange: (topic: string) => void;
  onPeerSpeaking: (peerId: string, isSpeaking: boolean) => void;
}

export class WebRTCMeshRoom {
  private roomId: string;
  private userId: string;
  private alias: string;
  private localStream: MediaStream | null = null;
  private peers: Map<string, RTCPeerConnection> = new Map();
  private remoteAudioElements: Map<string, HTMLAudioElement> = new Map();
  private callbacks: WebRTCMeshCallbacks;
  private realtimeChannel: any = null;
  private localBroadcastChannel: BroadcastChannel | null = null;

  constructor(roomId: string, userId: string, alias: string, callbacks: WebRTCMeshCallbacks) {
    this.roomId = roomId;
    this.userId = userId;
    this.alias = alias;
    this.callbacks = callbacks;
  }

  public async start(stream: MediaStream) {
    this.localStream = stream;

    // Use Supabase Realtime broadcast if available
    if (isSupabaseConfigured && supabase) {
      this.realtimeChannel = supabase.channel(`room_${this.roomId}`, {
        config: { broadcast: { self: false } },
      });

      this.realtimeChannel
        .on('broadcast', { event: 'signal' }, (payload: { payload: SignalMessage }) => {
          this.handleSignal(payload.payload);
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            this.broadcastSignal({ type: 'join', userId: this.userId, alias: this.alias });
          }
        });
    } else {
      // Local fallback with BroadcastChannel
      try {
        this.localBroadcastChannel = new BroadcastChannel(`sceneon_mesh_${this.roomId}`);
        this.localBroadcastChannel.onmessage = (event) => {
          if (event.data && event.data.userId !== this.userId && event.data.from !== this.userId) {
            this.handleSignal(event.data);
          }
        };
        // Announce presence
        this.broadcastSignal({ type: 'join', userId: this.userId, alias: this.alias });
      } catch (err) {
        console.warn('BroadcastChannel not supported in this environment', err);
      }
    }
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

  private async createPeerConnection(targetUserId: string, isInitiator: boolean): Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peers.set(targetUserId, pc);

    // Add local audio tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.broadcastSignal({
          type: 'candidate',
          from: this.userId,
          to: targetUserId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        // Create an audio element to play it
        let audioEl = this.remoteAudioElements.get(targetUserId);
        if (!audioEl) {
          audioEl = new Audio();
          audioEl.autoplay = true;
          this.remoteAudioElements.set(targetUserId, audioEl);
        }
        audioEl.srcObject = remoteStream;
        audioEl.play().catch(console.warn);

        this.callbacks.onRemoteStream(targetUserId, remoteStream);
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.broadcastSignal({
          type: 'offer',
          from: this.userId,
          to: targetUserId,
          sdp: offer,
        });
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    }

    return pc;
  }

  private async handleSignal(msg: SignalMessage) {
    switch (msg.type) {
      case 'join': {
        if (msg.userId !== this.userId) {
          // Existing peer sends offer to joining user
          await this.createPeerConnection(msg.userId, true);
        }
        break;
      }
      case 'offer': {
        if (msg.to === this.userId) {
          const pc = await this.createPeerConnection(msg.from, false);
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.broadcastSignal({
            type: 'answer',
            from: this.userId,
            to: msg.from,
            sdp: answer,
          });
        }
        break;
      }
      case 'answer': {
        if (msg.to === this.userId) {
          const pc = this.peers.get(msg.from);
          if (pc && pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          }
        }
        break;
      }
      case 'candidate': {
        if (msg.to === this.userId) {
          const pc = this.peers.get(msg.from);
          if (pc && msg.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch (err) {
              console.warn('ICE Candidate error:', err);
            }
          }
        }
        break;
      }
      case 'leave': {
        this.cleanupPeer(msg.userId);
        this.callbacks.onPeerLeave(msg.userId);
        break;
      }
      case 'reaction': {
        this.callbacks.onReaction(msg.emoji, msg.userId);
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
    }
  }

  public sendReaction(emoji: string) {
    this.broadcastSignal({
      type: 'reaction',
      userId: this.userId,
      emoji,
    });
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

  private cleanupPeer(peerId: string) {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
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
    });

    this.peers.forEach((pc) => pc.close());
    this.peers.clear();

    this.remoteAudioElements.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    this.remoteAudioElements.clear();

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
