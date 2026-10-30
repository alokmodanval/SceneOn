import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  Sparkles,
  Users,
  ShieldAlert,
  Dices,
  Sliders,
  CloudRain,
  Coffee,
  Radio,
  Zap,
  Lock,
  Unlock,
  Share2,
  Copy,
  Check,
  Crown,
  Hand,
  MessageSquare,
  Send,
  Music,
} from 'lucide-react';
import {
  DjSoundType,
  RoomChatMessage,
  RoomParticipant,
  SceneRoom,
  SceneUser,
  VoiceFilterMode,
} from '../types';
import {
  ambientMixer,
  AmbientSoundType,
  createSilentAudioStream,
  createVoiceFilterPipeline,
  createVolumeMeter,
  playDjSound,
  playUiSound,
  VoiceFilterPipeline,
} from '../lib/audioEngine';
import { WebRTCMeshRoom } from '../lib/webrtcMesh';
import { TOPIC_DECK } from '../lib/constants';
import { voteAura } from '../lib/supabase';
import confetti from 'canvas-confetti';

interface VoiceRoomActiveProps {
  room: SceneRoom;
  currentUser: SceneUser;
  onLeaveRoom: () => void;
  onUpdateRoom: (room: SceneRoom) => void;
}

const DJ_SOUND_BUTTONS: { type: DjSoundType; label: string; icon: string }[] = [
  { type: 'airhorn', label: 'Airhorn', icon: '📯' },
  { type: 'applause', label: 'Claps', icon: '👏' },
  { type: 'laugh', label: 'Laugh', icon: '😂' },
  { type: 'drumroll', label: 'Drumroll', icon: '🥁' },
  { type: 'crickets', label: 'Crickets', icon: '🦗' },
  { type: 'tadaa', label: 'Tadaa', icon: '🎉' },
];

export const VoiceRoomActive: React.FC<VoiceRoomActiveProps> = ({
  room,
  currentUser,
  onLeaveRoom,
  onUpdateRoom,
}) => {
  // Determine if current user is host
  const isHost = room.host_id === currentUser.id || room.participants[0]?.id === currentUser.id;

  // Find my current seat
  const myExistingParticipant = room.participants.find((p) => p.id === currentUser.id);
  const myInitialRole: 'host' | 'speaker' | 'listener' = isHost
    ? 'host'
    : myExistingParticipant?.role || (room.participants.length < 6 ? 'speaker' : 'listener');
  const myInitialSeat = isHost ? 1 : myExistingParticipant?.seat_number || 2;

  // Local user stage state
  const [myRole, setMyRole] = useState<'host' | 'speaker' | 'listener'>(myInitialRole);
  const [mySeat, setMySeat] = useState<number | undefined>(myInitialRole !== 'listener' ? myInitialSeat : undefined);
  const [isMuted, setIsMuted] = useState(true);
  const [voiceFilter, setVoiceFilter] = useState<VoiceFilterMode>('natural');
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

  // Room state
  const [participants, setParticipants] = useState<RoomParticipant[]>(() => {
    const list = [...(room.participants || [])];
    const exists = list.find((p) => p.id === currentUser.id);
    if (!exists) {
      list.push({
        id: currentUser.id,
        alias: currentUser.alias,
        avatar: currentUser.avatar,
        is_muted: true,
        is_speaking: false,
        voice_filter: 'natural',
        role: myInitialRole,
        seat_number: myInitialRole !== 'listener' ? myInitialSeat : undefined,
        joined_at: new Date().toISOString(),
      });
    }
    return list;
  });

  const [lockedSeats, setLockedSeats] = useState<number[]>(room.locked_seats || []);
  const [activeTopic, setActiveTopic] = useState(room.active_topic || TOPIC_DECK[0]);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const [djAnnouncement, setDjAnnouncement] = useState<string | null>(null);

  // In-room live chat messages
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([
    {
      id: 'welcome',
      sender_id: 'system',
      sender_alias: 'SceneBot ⚡',
      text: `Welcome to "${room.title}"! Respect the vibe & tap reaction gifts.`,
      created_at: new Date().toISOString(),
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [showChatBox, setShowChatBox] = useState(false);

  // Ambient sound mixer state
  const [ambientType, setAmbientType] = useState<AmbientSoundType>('none');
  const [ambientVol, setAmbientVol] = useState(14);
  const [showAmbientMenu, setShowAmbientMenu] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Audio & WebRTC references
  const rawStreamRef = useRef<MediaStream | null>(null);
  const filterPipelineRef = useRef<VoiceFilterPipeline | null>(null);
  const meshRoomRef = useRef<WebRTCMeshRoom | null>(null);
  const meterCleanupRef = useRef<(() => void) | null>(null);
  const remoteMetersRef = useRef<Map<string, () => void>>(new Map());

  // Initialize WebRTC Mesh
  useEffect(() => {
    let isCancelled = false;

    async function initAudioAndMesh() {
      // Step 1: Start with a silent dummy stream so audience listeners can join without permission prompts
      let audioStream: MediaStream;
      try {
        if (myRole !== 'listener') {
          // If on stage, request mic
          audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          });
          rawStreamRef.current = audioStream;

          // Mute by default
          audioStream.getAudioTracks().forEach((t) => (t.enabled = false));

          // Set up filter pipeline
          const pipeline = createVoiceFilterPipeline(audioStream);
          filterPipelineRef.current = pipeline;

          // Meter for local speaking
          meterCleanupRef.current = createVolumeMeter(audioStream, (_level, isSpeaking) => {
            setIsLocalSpeaking(isSpeaking && !isMuted);
            if (meshRoomRef.current) {
              meshRoomRef.current.broadcastSpeaking(isSpeaking && !isMuted);
            }
          });

          audioStream = pipeline.outputStream;
        } else {
          audioStream = createSilentAudioStream();
        }
      } catch (err) {
        console.warn('Microphone not acquired, continuing in listen-only mode:', err);
        audioStream = createSilentAudioStream();
        setMyRole('listener');
        setMySeat(undefined);
      }

      if (isCancelled) return;

      // Step 2: Initialize WebRTC mesh room with PeerJS
      const mesh = new WebRTCMeshRoom(room.id, currentUser.id, currentUser.alias, {
        onRemoteStream: (peerId, remoteStream) => {
          // Attach volume meter to remote stream to animate speaking ring
          const cleanup = createVolumeMeter(remoteStream, (_level, isSpeaking) => {
            setParticipants((prev) =>
              prev.map((p) => (p.id === peerId ? { ...p, is_speaking: isSpeaking } : p))
            );
          });
          remoteMetersRef.current.set(peerId, cleanup);
        },
        onPeerLeave: (peerId, leftUserId) => {
          const target = leftUserId || peerId;
          setParticipants((prev) => prev.filter((p) => p.id !== target));
          const cleanup = remoteMetersRef.current.get(peerId);
          if (cleanup) {
            cleanup();
            remoteMetersRef.current.delete(peerId);
          }
        },
        onPeerJoin: (p) => {
          setParticipants((prev) => {
            if (prev.some((x) => x.id === p.id)) return prev;
            return [
              ...prev,
              {
                id: p.id || p.peerId,
                alias: p.alias || 'GenZ Friend',
                avatar: p.avatar || { bg: 'from-violet-600 to-indigo-900', emoji: '⚡' },
                is_muted: true,
                is_speaking: false,
                voice_filter: 'natural',
                role: p.role || 'speaker',
                seat_number: p.seat_number,
                joined_at: new Date().toISOString(),
              },
            ];
          });
        },
        onReaction: (emoji) => {
          triggerFloatingReaction(emoji);
        },
        onDjSound: (sound, senderAlias) => {
          playDjSound(sound);
          setDjAnnouncement(`🎛️ ${senderAlias} played ${sound.toUpperCase()}!`);
          setTimeout(() => setDjAnnouncement(null), 3000);
        },
        onRoomChat: (msg) => {
          setChatMessages((prev) => [...prev, msg]);
          playUiSound('pop');
        },
        onTopicChange: (newTopic) => {
          setActiveTopic(newTopic);
        },
        onPeerSpeaking: (peerId, speaking) => {
          setParticipants((prev) =>
            prev.map((p) => (p.id === peerId ? { ...p, is_speaking: speaking } : p))
          );
        },
        onSeatChange: (userId, seat_number, role) => {
          setParticipants((prev) =>
            prev.map((p) => (p.id === userId ? { ...p, seat_number, role } : p))
          );
        },
        onLockSeat: (seat_num, isLocked) => {
          setLockedSeats((prev) =>
            isLocked ? [...prev, seat_num] : prev.filter((s) => s !== seat_num)
          );
        },
      });

      meshRoomRef.current = mesh;
      await mesh.start(audioStream, myInitialRole, myInitialSeat);
    }

    initAudioAndMesh();

    return () => {
      isCancelled = true;
      if (rawStreamRef.current) {
        rawStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (filterPipelineRef.current) {
        filterPipelineRef.current.cleanup();
      }
      if (meterCleanupRef.current) {
        meterCleanupRef.current();
      }
      remoteMetersRef.current.forEach((cleanup) => cleanup());
      remoteMetersRef.current.clear();
      if (meshRoomRef.current) {
        meshRoomRef.current.leave();
      }
      ambientMixer.stop();
    };
  }, [room.id, currentUser.id, currentUser.alias]);

  // Spacebar Push-to-Talk
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' && !e.repeat && isMuted && myRole !== 'listener') {
        e.preventDefault();
        setIsSpacePressed(true);
        toggleMic(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' && myRole !== 'listener') {
        e.preventDefault();
        setIsSpacePressed(false);
        toggleMic(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isMuted, myRole]);

  // Toggle Microphone
  const toggleMic = async (forceState?: boolean) => {
    if (myRole === 'listener') {
      alert('You are currently listening. Take a mic seat above to speak!');
      return;
    }

    const nextState = forceState !== undefined ? forceState : !isMuted;

    // If we don't have mic tracks yet, acquire mic now
    if (!rawStreamRef.current && !nextState) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        rawStreamRef.current = stream;
        const pipeline = createVoiceFilterPipeline(stream);
        filterPipelineRef.current = pipeline;
        if (meshRoomRef.current) {
          meshRoomRef.current.updateLocalStream(pipeline.outputStream);
        }
      } catch (err) {
        alert('Microphone permission needed to speak.');
        return;
      }
    }

    setIsMuted(nextState);

    if (rawStreamRef.current) {
      rawStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !nextState));
    }
    if (filterPipelineRef.current) {
      filterPipelineRef.current.outputStream.getAudioTracks().forEach((t) => (t.enabled = !nextState));
    }

    playUiSound('pop');
    setParticipants((prev) =>
      prev.map((p) => (p.id === currentUser.id ? { ...p, is_muted: nextState } : p))
    );
  };

  // Change Voice Filter
  const handleFilterChange = (mode: VoiceFilterMode) => {
    playUiSound('click');
    setVoiceFilter(mode);
    if (filterPipelineRef.current) {
      filterPipelineRef.current.setMode(mode);
    }
  };

  // Take a specific seat (or general take mic)
  const handleTakeSeat = async (seatNum: number) => {
    playUiSound('click');
    if (lockedSeats.includes(seatNum)) {
      alert(`Seat #${seatNum} is locked by the room host.`);
      return;
    }

    try {
      if (!rawStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        rawStreamRef.current = stream;
        stream.getAudioTracks().forEach((t) => (t.enabled = false));
        const pipeline = createVoiceFilterPipeline(stream);
        filterPipelineRef.current = pipeline;
        if (meshRoomRef.current) {
          meshRoomRef.current.updateLocalStream(pipeline.outputStream);
        }
      }
    } catch {
      alert('Could not access microphone.');
      return;
    }

    setMyRole('speaker');
    setMySeat(seatNum);
    setIsMuted(true);

    if (meshRoomRef.current) {
      meshRoomRef.current.broadcastSeatChange(seatNum, 'speaker');
    }

    setParticipants((prev) =>
      prev.map((p) =>
        p.id === currentUser.id ? { ...p, role: 'speaker', seat_number: seatNum, is_muted: true } : p
      )
    );
  };

  // Step down to audience
  const handleStepDown = () => {
    playUiSound('click');
    setMyRole('listener');
    setMySeat(undefined);
    setIsMuted(true);

    if (rawStreamRef.current) {
      rawStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
    }

    if (meshRoomRef.current) {
      meshRoomRef.current.broadcastSeatChange(undefined, 'listener');
    }

    setParticipants((prev) =>
      prev.map((p) =>
        p.id === currentUser.id ? { ...p, role: 'listener', seat_number: undefined, is_muted: true } : p
      )
    );
  };

  // Lock / Unlock seat (Host only)
  const handleToggleLockSeat = (seatNum: number) => {
    if (!isHost) return;
    playUiSound('pop');
    const isCurrentlyLocked = lockedSeats.includes(seatNum);
    const updated = isCurrentlyLocked
      ? lockedSeats.filter((s) => s !== seatNum)
      : [...lockedSeats, seatNum];

    setLockedSeats(updated);
    if (meshRoomRef.current) {
      meshRoomRef.current.broadcastLockSeat(seatNum, !isCurrentlyLocked);
    }
  };

  // Play DJ Soundboard SFX
  const handleTriggerDjSound = (type: DjSoundType) => {
    playDjSound(type);
    if (meshRoomRef.current) {
      meshRoomRef.current.sendDjSound(type);
    }
    setDjAnnouncement(`🎛️ You played ${type.toUpperCase()}!`);
    setTimeout(() => setDjAnnouncement(null), 2500);
  };

  // Trigger floating reaction emoji
  const handleSendReaction = (emoji: string) => {
    playUiSound('reaction');
    triggerFloatingReaction(emoji);
    if (meshRoomRef.current) {
      meshRoomRef.current.sendReaction(emoji);
    }
  };

  const triggerFloatingReaction = (emoji: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    const x = Math.random() * 80 + 10;
    setFloatingReactions((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2000);
  };

  // Send in-room chat message
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !meshRoomRef.current) return;
    const msg = meshRoomRef.current.sendRoomChatMessage(chatInput);
    setChatMessages((prev) => [...prev, msg]);
    setChatInput('');
    playUiSound('pop');
  };

  // Flip discussion topic
  const handleFlipTopic = () => {
    playUiSound('pop');
    const remaining = TOPIC_DECK.filter((t) => t !== activeTopic);
    const nextTopic = remaining[Math.floor(Math.random() * remaining.length)] || TOPIC_DECK[0];
    setActiveTopic(nextTopic);

    if (meshRoomRef.current) {
      meshRoomRef.current.broadcastTopic(nextTopic);
    }

    onUpdateRoom({
      ...room,
      active_topic: nextTopic,
    });
  };

  // Ambient sound selector
  const handleAmbientChange = (type: AmbientSoundType) => {
    playUiSound('click');
    setAmbientType(type);
    ambientMixer.setAmbient(type, ambientVol);
  };

  const handleAmbientVolChange = (vol: number) => {
    setAmbientVol(vol);
    ambientMixer.setVolume(vol);
  };

  // Copy shareable room link
  const handleCopyInvite = () => {
    const url = `${window.location.origin}/?room=${room.id}${
      room.is_private && room.room_pin ? `&pin=${room.room_pin}` : ''
    }`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    playUiSound('click');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Stage speakers vs Listeners
  const speakers = participants.filter((p) => p.role === 'host' || p.role === 'speaker');
  const listeners = participants.filter((p) => p.role === 'listener');

  return (
    <div className="relative w-full max-w-5xl mx-auto rounded-3xl bg-[#0D0D12] border-2 border-[#CCFF00] p-4 sm:p-7 shadow-neo overflow-hidden animate-fadeIn">
      {/* Floating Reactions Canvas */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
        {floatingReactions.map((r) => (
          <div
            key={r.id}
            style={{ left: `${r.x}%` }}
            className="absolute bottom-20 text-3xl sm:text-4xl animate-float-reaction"
          >
            {r.emoji}
          </div>
        ))}
      </div>

      {/* Top DJ Announcement Banner */}
      {djAnnouncement && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 bg-[#CCFF00] text-black font-mono font-black text-xs px-4 py-1.5 rounded-full shadow-neo animate-bounce">
          {djAnnouncement}
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCFF00] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#CCFF00]"></span>
            </span>

            {room.is_private ? (
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>PRIVATE VIP POD • PIN: {room.room_pin}</span>
              </span>
            ) : (
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                🌐 GLOBAL SCENE
              </span>
            )}

            <span className="text-xs font-mono text-white/50 px-2 py-0.5 rounded bg-white/5">
              {room.vibe_tag}
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-heading font-black text-white">
            {room.title}
          </h2>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end flex-wrap">
          {/* Share Link */}
          <button
            onClick={handleCopyInvite}
            title="Copy 1-Click Invite Link"
            className="px-3 py-1.5 rounded-xl text-xs font-mono bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 flex items-center gap-1.5 transition-all"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-[#CCFF00]" /> : <Share2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copiedLink ? 'Copied Link!' : 'Invite Friends'}</span>
          </button>

          {/* Ambient BGM Mixer */}
          <div className="relative">
            <button
              onClick={() => {
                playUiSound('click');
                setShowAmbientMenu(!showAmbientMenu);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 border transition-all ${
                ambientType !== 'none'
                  ? 'bg-violet-600/20 border-violet-500 text-violet-300'
                  : 'bg-[#15151c] border-white/10 text-white/70 hover:text-white'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>
                {ambientType === 'rain'
                  ? '🌧️ Rain'
                  : ambientType === 'cafe'
                  ? '☕ Tapri'
                  : ambientType === 'lofi'
                  ? '🎵 Lo-Fi'
                  : 'BGM'}
              </span>
            </button>

            {showAmbientMenu && (
              <div className="absolute right-0 mt-2 w-64 p-3 rounded-2xl bg-[#15151c] border border-white/20 shadow-neo z-50 space-y-3">
                <span className="text-[11px] font-mono text-white/60 block font-bold">
                  ROOM AMBIENT VIBE SYNTH
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => handleAmbientChange('none')}
                    className={`p-2 rounded-lg text-xs font-mono border text-left ${
                      ambientType === 'none'
                        ? 'bg-[#CCFF00]/15 border-[#CCFF00] text-white'
                        : 'border-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    Off
                  </button>
                  <button
                    onClick={() => handleAmbientChange('rain')}
                    className={`p-2 rounded-lg text-xs font-mono border text-left flex items-center gap-1 ${
                      ambientType === 'rain'
                        ? 'bg-[#CCFF00]/15 border-[#CCFF00] text-white'
                        : 'border-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    <CloudRain className="w-3 h-3 text-cyan-400" />
                    <span>Rain</span>
                  </button>
                  <button
                    onClick={() => handleAmbientChange('cafe')}
                    className={`p-2 rounded-lg text-xs font-mono border text-left flex items-center gap-1 ${
                      ambientType === 'cafe'
                        ? 'bg-[#CCFF00]/15 border-[#CCFF00] text-white'
                        : 'border-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    <Coffee className="w-3 h-3 text-amber-400" />
                    <span>Chai Tapri</span>
                  </button>
                  <button
                    onClick={() => handleAmbientChange('lofi')}
                    className={`p-2 rounded-lg text-xs font-mono border text-left flex items-center gap-1 ${
                      ambientType === 'lofi'
                        ? 'bg-[#CCFF00]/15 border-[#CCFF00] text-white'
                        : 'border-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    <Radio className="w-3 h-3 text-violet-400" />
                    <span>Lo-Fi</span>
                  </button>
                </div>

                {ambientType !== 'none' && (
                  <div className="space-y-1 pt-1 border-t border-white/10">
                    <div className="flex justify-between text-[10px] font-mono text-white/50">
                      <span>Volume</span>
                      <span>{ambientVol}%</span>
                    </div>
                    <input
                      type="range"
                      min="3"
                      max="30"
                      value={ambientVol}
                      onChange={(e) => handleAmbientVolChange(Number(e.target.value))}
                      className="w-full accent-[#CCFF00]"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Leave Button */}
          <button
            onClick={() => {
              playUiSound('click');
              onLeaveRoom();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400 font-mono text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>Leave</span>
          </button>
        </div>
      </div>

      {/* Discussion Topic Card */}
      <div className="my-4 p-4 rounded-2xl bg-[#111116] border border-white/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-0.5 flex-1">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#CCFF00]/10 text-[#CCFF00] border border-[#CCFF00]/30">
            ACTIVE DISCUSSION TOPIC 🎲
          </span>
          <p className="text-sm sm:text-base font-heading font-bold text-white mt-1">
            &quot;{activeTopic}&quot;
          </p>
        </div>

        <button
          onClick={handleFlipTopic}
          className="neo-btn-dark px-3 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 flex-shrink-0"
        >
          <Dices className="w-3.5 h-3.5 text-[#CCFF00]" />
          <span>Flip Topic</span>
        </button>
      </div>

      {/* Hello Yo-Style 6-Seat Interactive Stage Grid */}
      <div className="my-5">
        <div className="flex items-center justify-between mb-3 text-xs font-mono text-white/60">
          <span className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-[#CCFF00]" />
            <strong className="text-white">STAGE SEATS ({speakers.length}/6)</strong>
          </span>
          {myRole !== 'listener' ? (
            <button
              onClick={handleStepDown}
              className="text-xs text-violet-400 hover:underline flex items-center gap-1"
            >
              <span>🚶 Step Down to Audience</span>
            </button>
          ) : (
            <span className="text-[11px] text-white/40">Tap any open seat to take mic</span>
          )}
        </div>

        {/* 6 Stage Pods Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((seatNum) => {
            const occupant = speakers.find((p) => (p.seat_number || 1) === seatNum);
            const isMe = occupant?.id === currentUser.id;
            const isSpeaking = isMe ? isLocalSpeaking : occupant?.is_speaking;
            const isOccupantMuted = isMe ? isMuted : occupant?.is_muted;
            const isSeatLocked = lockedSeats.includes(seatNum);

            if (occupant) {
              return (
                <div
                  key={`seat-${seatNum}`}
                  className={`relative flex flex-col items-center p-3 rounded-2xl bg-[#111116] border transition-all ${
                    isSpeaking
                      ? 'border-[#CCFF00] shadow-glow-lime scale-[1.03]'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Seat Number Tag */}
                  <div className="absolute top-2 left-2 text-[10px] font-mono text-white/40">
                    #{seatNum}
                  </div>

                  {/* Host Crown */}
                  {seatNum === 1 && (
                    <div className="absolute top-2 right-2 text-amber-400" title="Room Host">
                      <Crown className="w-3.5 h-3.5 fill-current" />
                    </div>
                  )}

                  {/* Avatar with Acid Lime Pulse Speaking Ring */}
                  <div className="relative my-2">
                    <div
                      className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr ${
                        occupant.avatar?.bg || 'from-violet-600 to-indigo-900'
                      } flex items-center justify-center text-2xl transition-all ${
                        isSpeaking
                          ? 'ring-4 ring-[#CCFF00] ring-offset-2 ring-offset-[#070709] animate-pulse-speaking'
                          : 'border border-white/20'
                      }`}
                    >
                      {occupant.avatar?.emoji || '⚡'}
                    </div>

                    {/* Mic Status Icon */}
                    <div
                      className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] border-2 border-[#070709] ${
                        isOccupantMuted ? 'bg-rose-500 text-white' : 'bg-[#CCFF00] text-black font-bold'
                      }`}
                    >
                      {isOccupantMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                    </div>
                  </div>

                  {/* Alias & Identity */}
                  <span className="font-heading font-bold text-xs text-white text-center truncate max-w-full">
                    {occupant.alias} {isMe && '(You)'}
                  </span>

                  {/* Voice Mask Badge */}
                  {isMe && voiceFilter !== 'natural' ? (
                    <span className="text-[9px] font-mono text-[#00F0FF] uppercase mt-0.5">
                      {voiceFilter}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-white/40 mt-0.5">
                      {seatNum === 1 ? 'Host' : 'Speaker'}
                    </span>
                  )}
                </div>
              );
            }

            // Empty Seat
            return (
              <div
                key={`empty-seat-${seatNum}`}
                className="relative flex flex-col items-center justify-center p-3 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 hover:border-[#CCFF00]/40 transition-all min-h-[130px] group"
              >
                <div className="absolute top-2 left-2 text-[10px] font-mono text-white/30">
                  #{seatNum}
                </div>

                {isHost && (
                  <button
                    onClick={() => handleToggleLockSeat(seatNum)}
                    title={isSeatLocked ? 'Unlock Seat' : 'Lock Seat'}
                    className="absolute top-2 right-2 text-white/30 hover:text-white"
                  >
                    {isSeatLocked ? (
                      <Lock className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                )}

                {isSeatLocked ? (
                  <div className="flex flex-col items-center gap-1 text-rose-400/70">
                    <Lock className="w-6 h-6" />
                    <span className="text-[10px] font-mono">Locked</span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleTakeSeat(seatNum)}
                    className="flex flex-col items-center gap-1.5 text-white/40 group-hover:text-[#CCFF00] transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full border border-dashed border-white/20 group-hover:border-[#CCFF00] flex items-center justify-center text-sm font-bold">
                      +
                    </div>
                    <span className="text-[10px] font-mono font-bold">Take Mic</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Audience Section (Listeners Floor) */}
      {listeners.length > 0 && (
        <div className="mb-5 p-3 rounded-2xl bg-[#111116] border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono text-white/60 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-violet-400" />
              <span>AUDIENCE LISTENERS ({listeners.length})</span>
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {listeners.map((listener) => (
              <div
                key={listener.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 flex-shrink-0"
              >
                <div
                  className={`w-5 h-5 rounded-full bg-gradient-to-tr ${
                    listener.avatar?.bg || 'from-violet-600 to-indigo-900'
                  } flex items-center justify-center text-[10px]`}
                >
                  {listener.avatar?.emoji || '⚡'}
                </div>
                <span className="text-xs text-white/80 font-mono">
                  {listener.alias} {listener.id === currentUser.id && '(You)'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DJ Soundboard Bar (Hello Yo signature SFX) */}
      <div className="my-4 p-3 rounded-2xl bg-[#111116] border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono font-bold text-[#CCFF00] flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5" />
            <span>ROOM DJ SOUNDBOARD (LIVE SFX)</span>
          </span>
          <span className="text-[10px] font-mono text-white/40">Broadcasts sound to all</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {DJ_SOUND_BUTTONS.map((sfx) => (
            <button
              key={sfx.type}
              onClick={() => handleTriggerDjSound(sfx.type)}
              className="py-2 px-2.5 rounded-xl bg-white/5 hover:bg-[#CCFF00]/15 hover:border-[#CCFF00] border border-white/10 text-xs font-mono font-bold text-white flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm"
            >
              <span>{sfx.icon}</span>
              <span>{sfx.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Reaction Flying Bar */}
      <div className="flex items-center justify-between gap-2 py-3 border-t border-white/10">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="text-[11px] font-mono text-white/50 mr-1 hidden sm:inline">
            GIFTS & REACTIONS:
          </span>
          {['🔥', '💖', '🚀', '👑', '⚡', '🍕', '👏', '😂'].map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleSendReaction(emoji)}
              className="text-xl p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/15 hover:scale-125 active:scale-95 transition-all"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* In-Room Live Chat Toggle */}
        <button
          onClick={() => {
            playUiSound('pop');
            setShowChatBox(!showChatBox);
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 border transition-all ${
            showChatBox
              ? 'bg-[#CCFF00] text-black font-bold border-black'
              : 'bg-white/5 text-white/70 border-white/10 hover:text-white'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Live Chat ({chatMessages.length})</span>
        </button>
      </div>

      {/* Live In-Room Chat Drawer if open */}
      {showChatBox && (
        <div className="my-3 p-3 rounded-2xl bg-[#070709] border border-white/15 space-y-2 animate-fadeIn">
          <div className="h-32 overflow-y-auto space-y-1.5 pr-1 text-xs">
            {chatMessages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-1.5 font-mono">
                <span className="text-[#CCFF00] font-bold flex-shrink-0">
                  {msg.sender_alias}:
                </span>
                <span className="text-white/80">{msg.text}</span>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendChat} className="flex items-center gap-2 pt-2 border-t border-white/10">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Drop a live comment in the room..."
              className="flex-1 px-3 py-1.5 rounded-xl bg-[#111116] border border-white/15 focus:border-[#CCFF00] text-white text-xs outline-none"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="neo-btn-lime p-2 rounded-xl disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5 fill-black" />
            </button>
          </form>
        </div>
      )}

      {/* Bottom Mic & Voice Mask Control Bar */}
      <div className="pt-4 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left: Voice Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <span className="text-[11px] font-mono text-white/50 mr-1 flex items-center gap-1">
            <Sliders className="w-3 h-3" />
            <span>VOICE MASK:</span>
          </span>
          {(
            [
              { mode: 'natural', label: '🎙️ Natural' },
              { mode: 'deep', label: '🕵️ Deep DJ' },
              { mode: 'helium', label: '✨ Helium' },
              { mode: 'radio', label: '📻 Vintage Radio' },
            ] as const
          ).map((filter) => (
            <button
              key={filter.mode}
              onClick={() => handleFilterChange(filter.mode)}
              disabled={myRole === 'listener'}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                voiceFilter === filter.mode && myRole !== 'listener'
                  ? 'bg-[#CCFF00] text-black font-bold border-black shadow-neo-sm'
                  : 'bg-[#15151c] text-white/70 border-white/10 hover:border-white/30 disabled:opacity-40'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Center: Main Mic Toggle Button */}
        <div className="flex items-center gap-3">
          {myRole === 'listener' ? (
            <button
              onClick={() => handleTakeSeat(speakers.length + 1 <= 6 ? speakers.length + 1 : 2)}
              className="neo-btn-lime px-6 py-3 rounded-2xl font-heading font-black text-sm flex items-center gap-2 shadow-neo"
            >
              <Mic className="w-5 h-5 fill-black" />
              <span>🎙️ Hop On Mic (Take Seat)</span>
            </button>
          ) : (
            <button
              onClick={() => toggleMic()}
              className={`px-6 py-3 rounded-2xl font-heading font-black text-sm flex items-center gap-2 border-2 transition-all ${
                isMuted
                  ? 'bg-[#15151c] text-white border-white/20 hover:border-white/40 shadow-sm'
                  : 'bg-[#CCFF00] text-black border-black shadow-neo scale-105'
              }`}
            >
              {isMuted ? (
                <>
                  <MicOff className="w-5 h-5 text-rose-400" />
                  <span>Unmute Mic (Spacebar)</span>
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5 text-black" />
                  <span>Mute Mic (Live 🎙️)</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Right: Push-To-Talk Keyboard Prompt */}
        <div className="text-right">
          {myRole !== 'listener' ? (
            <span
              className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-all ${
                isSpacePressed
                  ? 'bg-[#CCFF00] text-black border-black font-bold'
                  : 'bg-white/5 text-white/60 border-white/10'
              }`}
            >
              Hold <strong className="text-white font-bold">Spacebar</strong> to Talk
            </span>
          ) : (
            <span className="text-xs font-mono text-white/40">
              🎧 Listening Mode Active
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
