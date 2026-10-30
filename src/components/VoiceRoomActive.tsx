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
} from 'lucide-react';
import { RoomParticipant, SceneRoom, SceneUser, VoiceFilterMode } from '../types';
import {
  ambientMixer,
  AmbientSoundType,
  createVoiceFilterPipeline,
  createVolumeMeter,
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

export const VoiceRoomActive: React.FC<VoiceRoomActiveProps> = ({
  room,
  currentUser,
  onLeaveRoom,
  onUpdateRoom,
}) => {
  // Mic state
  const [isMuted, setIsMuted] = useState(true);
  const [voiceFilter, setVoiceFilter] = useState<VoiceFilterMode>('natural');
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Ambient sound mixer state
  const [ambientType, setAmbientType] = useState<AmbientSoundType>('none');
  const [ambientVol, setAmbientVol] = useState(12);
  const [showAmbientMenu, setShowAmbientMenu] = useState(false);

  // Active topic
  const [activeTopic, setActiveTopic] = useState(room.active_topic || TOPIC_DECK[0]);

  // Floating reaction emojis
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);

  // Participants in the room
  const [participants, setParticipants] = useState<RoomParticipant[]>(() => {
    const list = [...(room.participants || [])];
    if (!list.some((p) => p.id === currentUser.id)) {
      list.push({
        id: currentUser.id,
        alias: currentUser.alias,
        avatar: currentUser.avatar,
        is_muted: true,
        is_speaking: false,
        voice_filter: 'natural',
        joined_at: new Date().toISOString(),
      });
    }
    return list;
  });

  // Kick votes: targetId -> array of voterIds
  const [kickVotes, setKickVotes] = useState<Record<string, string[]>>(room.kick_votes || {});

  // WebRTC mesh and pipeline references
  const rawStreamRef = useRef<MediaStream | null>(null);
  const filterPipelineRef = useRef<VoiceFilterPipeline | null>(null);
  const meshRoomRef = useRef<WebRTCMeshRoom | null>(null);
  const meterCleanupRef = useRef<(() => void) | null>(null);

  // Audio setup on mount
  useEffect(() => {
    let isCancelled = false;

    async function initAudioAndMesh() {
      try {
        // Request microphone
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        rawStreamRef.current = stream;

        // Auto mute by default
        stream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });

        // Initialize Web Audio Filter Pipeline
        const pipeline = createVoiceFilterPipeline(stream);
        filterPipelineRef.current = pipeline;

        // Hook up volume meter for local speaking neon ring
        const cleanupMeter = createVolumeMeter(stream, (_level, isSpeaking) => {
          setIsLocalSpeaking(isSpeaking && !isMuted);
          if (meshRoomRef.current) {
            meshRoomRef.current.broadcastSpeaking(isSpeaking && !isMuted);
          }
        });
        meterCleanupRef.current = cleanupMeter;

        // Start WebRTC mesh room
        const mesh = new WebRTCMeshRoom(room.id, currentUser.id, currentUser.alias, {
          onRemoteStream: (peerId, _remoteStream) => {
            console.log('Connected audio stream from peer:', peerId);
          },
          onPeerLeave: (peerId) => {
            setParticipants((prev) => prev.filter((p) => p.id !== peerId));
          },
          onReaction: (emoji, _senderId) => {
            triggerFloatingReaction(emoji);
          },
          onTopicChange: (newTopic) => {
            setActiveTopic(newTopic);
          },
          onPeerSpeaking: (peerId, speaking) => {
            setParticipants((prev) =>
              prev.map((p) => (p.id === peerId ? { ...p, is_speaking: speaking } : p))
            );
          },
        });

        meshRoomRef.current = mesh;
        await mesh.start(pipeline.outputStream);
      } catch (err) {
        console.warn('Microphone permission denied or not available:', err);
      }
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
      if (meshRoomRef.current) {
        meshRoomRef.current.leave();
      }
      ambientMixer.stop();
    };
  }, [room.id, currentUser.id, currentUser.alias]);

  // Spacebar Push-to-Talk handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space' && !e.repeat && isMuted) {
        e.preventDefault();
        setIsSpacePressed(true);
        toggleMic(false); // unmute while held
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpacePressed(false);
        toggleMic(true); // re-mute on release
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isMuted]);

  // Toggle microphone
  const toggleMic = (forceState?: boolean) => {
    const nextState = forceState !== undefined ? forceState : !isMuted;
    setIsMuted(nextState);

    if (rawStreamRef.current) {
      rawStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !nextState;
      });
    }

    playUiSound('pop');
    setParticipants((prev) =>
      prev.map((p) => (p.id === currentUser.id ? { ...p, is_muted: nextState } : p))
    );
  };

  // Change voice filter
  const handleFilterChange = (mode: VoiceFilterMode) => {
    playUiSound('click');
    setVoiceFilter(mode);
    if (filterPipelineRef.current) {
      filterPipelineRef.current.setMode(mode);
    }
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

  // Vote Kick participant
  const handleVoteKick = (targetId: string, targetAlias: string) => {
    playUiSound('kick');
    const currentVoters = kickVotes[targetId] || [];
    if (currentVoters.includes(currentUser.id)) {
      alert(`You have already voted to kick ${targetAlias}.`);
      return;
    }

    const updatedVoters = [...currentVoters, currentUser.id];
    const updatedVotes = { ...kickVotes, [targetId]: updatedVoters };
    setKickVotes(updatedVotes);

    if (updatedVoters.length >= 2) {
      // 2-Vote threshold reached: kick target participant!
      playUiSound('kick');
      setParticipants((prev) => prev.filter((p) => p.id !== targetId));
      alert(`🚫 ${targetAlias} was voted out by the room community.`);
    } else {
      alert(`Vote registered against ${targetAlias} (1/2 votes needed).`);
    }

    onUpdateRoom({
      ...room,
      kick_votes: updatedVotes,
    });
  };

  // Award Aura to participant
  const handleAwardAura = async (targetId: string, amount: number) => {
    playUiSound('pop');
    const res = await voteAura(targetId, currentUser.id, amount);
    if (!res.success) {
      alert(res.message || 'Already voted for this participant');
    } else {
      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.7 },
      });
      alert(`Aura vote recorded! (${amount > 0 ? '+1 Aura ⚡' : '-2 Aura 🚩'})`);
    }
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto rounded-3xl bg-[#0D0D12] border-2 border-[#CCFF00] p-4 sm:p-8 shadow-neo overflow-hidden animate-fadeIn">
      {/* Floating Reactions Canvas Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
        {floatingReactions.map((r) => (
          <div
            key={r.id}
            style={{ left: `${r.x}%` }}
            className="absolute bottom-16 text-3xl sm:text-4xl animate-float-reaction"
          >
            {r.emoji}
          </div>
        ))}
      </div>

      {/* Room Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCFF00] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#CCFF00]"></span>
            </span>
            <span className="text-xs font-mono font-bold text-[#CCFF00] uppercase tracking-wider">
              LIVE P2P VOICE SCENE
            </span>
            <span className="text-xs font-mono text-white/50 px-2 py-0.5 rounded bg-white/5">
              {room.vibe_tag}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-heading font-black text-white">
            {room.title}
          </h2>
        </div>

        {/* Ambient Sounds Toggle & Leave */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          <div className="relative">
            <button
              onClick={() => {
                playUiSound('click');
                setShowAmbientMenu(!showAmbientMenu);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-mono flex items-center gap-1.5 border transition-all ${
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
                  ? '☕ Cafe'
                  : ambientType === 'lofi'
                  ? '🎵 Lo-Fi'
                  : 'Ambient Vibe'}
              </span>
            </button>

            {/* Ambient Sound Dropdown */}
            {showAmbientMenu && (
              <div className="absolute right-0 mt-2 w-64 p-3 rounded-2xl bg-[#15151c] border border-white/20 shadow-neo z-40 space-y-3">
                <span className="text-[11px] font-mono text-white/60 block">
                  SYNTHESIZED AMBIENT BACKGROUND
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
                    <span>Cafe</span>
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
                      max="25"
                      value={ambientVol}
                      onChange={(e) => handleAmbientVolChange(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              playUiSound('click');
              onLeaveRoom();
            }}
            className="px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400 font-mono text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>Leave Scene</span>
          </button>
        </div>
      </div>

      {/* Synchronous Discussion Topic Deck */}
      <div className="my-6 p-4 sm:p-5 rounded-2xl bg-[#111116] border border-white/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#CCFF00]/10 text-[#CCFF00] border border-[#CCFF00]/30">
              CURRENT SCENE DEBATE TOPIC 🎲
            </span>
          </div>
          <p className="text-base sm:text-lg font-heading font-bold text-white">
            &quot;{activeTopic}&quot;
          </p>
        </div>

        <button
          onClick={handleFlipTopic}
          className="neo-btn-dark px-4 py-2.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 flex-shrink-0"
        >
          <Dices className="w-4 h-4 text-[#CCFF00]" />
          <span>Flip Next Topic</span>
        </button>
      </div>

      {/* 6-Participant Mesh Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 my-6">
        {participants.slice(0, 6).map((participant) => {
          const isMe = participant.id === currentUser.id;
          const isSpeaking = isMe ? isLocalSpeaking : participant.is_speaking;
          const participantMuted = isMe ? isMuted : participant.is_muted;
          const votesCount = kickVotes[participant.id]?.length || 0;

          return (
            <div
              key={participant.id}
              className={`relative flex flex-col items-center p-4 rounded-2xl bg-[#111116] border transition-all ${
                isSpeaking
                  ? 'border-[#CCFF00] shadow-glow-lime scale-105'
                  : 'border-white/10 hover:border-white/20'
              }`}
            >
              {/* Avatar with Acid Lime Pulse Speaking Ring */}
              <div className="relative mb-3">
                <div
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr ${
                    participant.avatar?.bg || 'from-violet-600 to-indigo-900'
                  } flex items-center justify-center text-2xl sm:text-3xl transition-all ${
                    isSpeaking
                      ? 'ring-4 ring-[#CCFF00] ring-offset-4 ring-offset-[#070709] animate-pulse-speaking'
                      : 'border-2 border-white/20'
                  }`}
                >
                  {participant.avatar?.emoji || '⚡'}
                </div>

                {/* Mic Status Icon */}
                <div
                  className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs border-2 border-[#070709] ${
                    participantMuted
                      ? 'bg-rose-500 text-white'
                      : 'bg-[#CCFF00] text-black font-bold'
                  }`}
                >
                  {participantMuted ? (
                    <MicOff className="w-3 h-3" />
                  ) : (
                    <Mic className="w-3 h-3" />
                  )}
                </div>
              </div>

              {/* Alias & Tags */}
              <span className="font-heading font-bold text-sm text-white text-center truncate max-w-full">
                {participant.alias} {isMe && '(You)'}
              </span>

              {/* Filter badge if active */}
              {isMe && voiceFilter !== 'natural' && (
                <span className="text-[9px] font-mono text-[#00F0FF] uppercase mt-0.5">
                  Mask: {voiceFilter}
                </span>
              )}

              {/* Moderation Actions for other participants */}
              {!isMe && (
                <div className="mt-3 flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleAwardAura(participant.id, 1)}
                    title="Give W Scene (+1 Aura)"
                    className="p-1 rounded bg-white/5 hover:bg-[#CCFF00]/20 text-[#CCFF00] text-[10px] font-mono"
                  >
                    +1⚡
                  </button>
                  <button
                    onClick={() => handleVoteKick(participant.id, participant.alias)}
                    title={`Vote Kick (${votesCount}/2 votes)`}
                    className="p-1 rounded bg-white/5 hover:bg-rose-500/20 text-rose-400 text-[10px] font-mono flex items-center gap-0.5"
                  >
                    <ShieldAlert className="w-3 h-3" />
                    {votesCount > 0 && <span>{votesCount}</span>}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Empty Seats Filler up to 6 */}
        {Array.from({ length: Math.max(0, 6 - participants.length) }).map((_, idx) => (
          <div
            key={`empty-${idx}`}
            className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 min-h-[140px]"
          >
            <div className="w-12 h-12 rounded-full border border-dashed border-white/20 flex items-center justify-center text-white/30 text-xs mb-2 font-mono">
              Seat #{participants.length + idx + 1}
            </div>
            <span className="text-[11px] font-mono text-white/30">Open Mic</span>
          </div>
        ))}
      </div>

      {/* Floating Reaction Bar */}
      <div className="flex items-center justify-center gap-2 py-3 border-t border-white/10">
        <span className="text-[11px] font-mono text-white/50 mr-2 hidden sm:inline">
          REACTIONS:
        </span>
        {['🔥', '💀', '😂', '⚡', '👏', '🧢'].map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleSendReaction(emoji)}
            className="text-xl sm:text-2xl p-2 rounded-xl bg-white/5 hover:bg-white/15 hover:scale-125 active:scale-95 transition-all"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Bottom Microphone & Voice Mask Controls Bar */}
      <div className="pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Left: 4 Voice Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <span className="text-[11px] font-mono text-white/50 mr-1 flex items-center gap-1">
            <Sliders className="w-3 h-3" />
            <span>VOICE MASK:</span>
          </span>
          {(
            [
              { mode: 'natural', label: '🎙️ Natural' },
              { mode: 'deep', label: '🕵️ Stealth Deep' },
              { mode: 'helium', label: '✨ Helium' },
              { mode: 'radio', label: '📻 Vintage Lo-Fi' },
            ] as const
          ).map((filter) => (
            <button
              key={filter.mode}
              onClick={() => handleFilterChange(filter.mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                voiceFilter === filter.mode
                  ? 'bg-[#CCFF00] text-black font-bold border-black shadow-neo-sm'
                  : 'bg-[#15151c] text-white/70 border-white/10 hover:border-white/30 hover:text-white'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Center: Main Mic Toggle Button */}
        <div className="flex items-center gap-3">
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
                <span>Unmute Mic</span>
              </>
            ) : (
              <>
                <Mic className="w-5 h-5 text-black" />
                <span>Mute Mic (Live 🎙️)</span>
              </>
            )}
          </button>
        </div>

        {/* Right: Push-To-Talk Keyboard Prompt */}
        <div className="text-right">
          <span
            className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-all ${
              isSpacePressed
                ? 'bg-[#CCFF00] text-black border-black font-bold'
                : 'bg-white/5 text-white/60 border-white/10'
            }`}
          >
            Hold <strong className="text-white font-bold">Spacebar</strong> to Talk
          </span>
        </div>
      </div>
    </div>
  );
};
