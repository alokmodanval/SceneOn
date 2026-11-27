import React, { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Mic,
  MicOff,
  PhoneOff,
  Heart,
  X,
  Sparkles,
  Zap,
  Radio,
  Dices,
  ArrowRight,
  MessageCircle,
  Timer,
} from 'lucide-react';
import {
  MatchScoreResult,
  SceneUser,
  SpeedDateSession,
  SpeedDateStage,
  VoiceFilterMode,
} from '../types';
import {
  createSilentAudioStream,
  createVoiceFilterPipeline,
  createVolumeMeter,
  playUiSound,
  VoiceFilterPipeline,
} from '../lib/audioEngine';
import { WebRTCMeshRoom } from '../lib/webrtcMesh';
import { MASKED_CODENAMES, SPEED_DATE_TOPICS } from '../lib/constants';
import { calculateSceneMatch } from '../lib/matchAlgorithm';
import { getOrCreateChat } from '../lib/supabase';

interface SpeedDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: SceneUser;
  peers: SceneUser[];
  onOpenChat: (peer: SceneUser) => void;
}

export const SpeedDateModal: React.FC<SpeedDateModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  peers,
  onOpenChat,
}) => {
  const [stage, setStage] = useState<SpeedDateStage>('radar');
  const [session, setSession] = useState<SpeedDateSession | null>(null);
  const [matchScore, setMatchScore] = useState<MatchScoreResult>({
    totalMatch: 85,
    tagSimilarity: 80,
    sliderCloseness: 90,
    commonTags: [],
  });

  const [timeLeft, setTimeLeft] = useState(180);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceFilter, setVoiceFilter] = useState<VoiceFilterMode>('natural');
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const [isSubmittingVerdict, setIsSubmittingVerdict] = useState(false);
  const [waitingPartnerVerdict, setWaitingPartnerVerdict] = useState(false);
  const [bailNotice, setBailNotice] = useState<string | null>(null);

  const isMutedRef = useRef(isMuted);
  const isActiveRef = useRef(false);
  const remoteVerdictRef = useRef<'w_scene' | 'pass' | null>(null);
  const peersRef = useRef(peers);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  const rawStreamRef = useRef<MediaStream | null>(null);
  const filterPipelineRef = useRef<VoiceFilterPipeline | null>(null);
  const meshRef = useRef<WebRTCMeshRoom | null>(null);
  const meterCleanupRef = useRef<(() => void) | null>(null);
  const remoteMeterRef = useRef<(() => void) | null>(null);
  const radarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verdictGraceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupAudio = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore speech synthesis errors
      }
    }
    if (radarTimerRef.current) {
      clearTimeout(radarTimerRef.current);
      radarTimerRef.current = null;
    }
    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
    if (callIntervalRef.current) {
      clearInterval(callIntervalRef.current);
      callIntervalRef.current = null;
    }
    if (aiSpeechTimerRef.current) {
      clearTimeout(aiSpeechTimerRef.current);
      aiSpeechTimerRef.current = null;
    }
    if (verdictGraceRef.current) {
      clearTimeout(verdictGraceRef.current);
      verdictGraceRef.current = null;
    }
    if (rawStreamRef.current) {
      rawStreamRef.current.getTracks().forEach((t) => t.stop());
      rawStreamRef.current = null;
    }
    if (filterPipelineRef.current) {
      filterPipelineRef.current.cleanup();
      filterPipelineRef.current = null;
    }
    if (meterCleanupRef.current) {
      meterCleanupRef.current();
      meterCleanupRef.current = null;
    }
    if (remoteMeterRef.current) {
      remoteMeterRef.current();
      remoteMeterRef.current = null;
    }
    if (meshRef.current) {
      meshRef.current.leave();
      meshRef.current = null;
    }
  }, []);

  const triggerFloatingReaction = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    const x = Math.random() * 70 + 15;
    setFloatingReactions((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2000);
  }, []);

  const handleEarlyBail = useCallback(
    (reason?: string) => {
      playUiSound('kick');
      cleanupAudio();
      if (reason) setBailNotice(reason);
      setStage('passed');
    },
    [cleanupAudio]
  );

  const completeMutualMatch = useCallback(
    async (sess: SpeedDateSession) => {
      try {
        await getOrCreateChat(currentUser.id, sess.partner.id);
      } catch (err) {
        console.error('Failed to finalize speed match chat:', err);
      }

      playUiSound('unlock');
      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#CCFF00', '#FF2E93', '#00F0FF', '#8B5CF6'],
      });
      cleanupAudio();
      setWaitingPartnerVerdict(false);
      setIsSubmittingVerdict(false);
      setStage('matched');
    },
    [cleanupAudio, currentUser.id]
  );

  const simulateAIPartnerAudio = useCallback((sess: SpeedDateSession) => {
    aiSpeechTimerRef.current = setTimeout(() => {
      if (!isActiveRef.current) return;
      try {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const welcomeUtterance = new SpeechSynthesisUtterance(
            `Hey! I'm ${sess.maskedAlias}. Let's debate: ${sess.topic}`
          );
          welcomeUtterance.rate = 1.05;
          welcomeUtterance.pitch = 1.15;
          welcomeUtterance.onstart = () => setIsRemoteSpeaking(true);
          welcomeUtterance.onend = () => setIsRemoteSpeaking(false);
          window.speechSynthesis.speak(welcomeUtterance);
        }
      } catch (err) {
        console.warn('Speech synthesis skipped:', err);
      }
    }, 2000);
  }, []);

  const startLiveVoiceCall = useCallback(
    async (sess: SpeedDateSession) => {
      if (!isActiveRef.current) return;

      try {
        let audioStream: MediaStream;
        let hasMic = true;
        try {
          audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          });
          if (!isActiveRef.current) {
            audioStream.getTracks().forEach((t) => t.stop());
            return;
          }
          rawStreamRef.current = audioStream;

          const pipeline = createVoiceFilterPipeline(audioStream);
          filterPipelineRef.current = pipeline;

          meterCleanupRef.current = createVolumeMeter(audioStream, (_level, isSpeaking) => {
            const active = isSpeaking && !isMutedRef.current;
            setIsLocalSpeaking(active);
            meshRef.current?.broadcastSpeaking(active);
          });

          audioStream = pipeline.outputStream;
        } catch (micErr) {
          console.warn('Microphone not available, using silent stream:', micErr);
          hasMic = false;
          setIsMuted(true);
          isMutedRef.current = true;
          audioStream = createSilentAudioStream();
        }

        if (!isActiveRef.current) return;

        const mesh = new WebRTCMeshRoom(
          sess.sessionId,
          currentUser.id,
          currentUser.alias,
          {
            onRemoteStream: (_peerId, remoteStream) => {
              if (remoteMeterRef.current) remoteMeterRef.current();
              remoteMeterRef.current = createVolumeMeter(remoteStream, (_level, isSpeaking) => {
                setIsRemoteSpeaking(isSpeaking);
              });
            },
            onPeerLeave: () => {
              handleEarlyBail('Partner disconnected from the call.');
            },
            onReaction: (emoji) => {
              triggerFloatingReaction(emoji);
            },
            onTopicChange: (newTopic) => {
              setSession((prev) => (prev ? { ...prev, topic: newTopic } : null));
            },
            onPeerSpeaking: (_peerId, speaking) => {
              setIsRemoteSpeaking(speaking);
            },
            onSpeedVerdict: (_userId, verdict) => {
              remoteVerdictRef.current = verdict;
              if (verdict === 'pass') {
                handleEarlyBail('Your partner chose to pass this round.');
              } else if (verdict === 'w_scene' && waitingPartnerVerdict) {
                completeMutualMatch(sess);
              }
            },
          },
          currentUser.avatar,
          !hasMic
        );

        meshRef.current = mesh;
        await mesh.start(audioStream, 'speaker', 1);

        if (!isActiveRef.current) {
          cleanupAudio();
          return;
        }

        setStage('in_call');
        playUiSound('unlock');

        callIntervalRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              if (callIntervalRef.current) clearInterval(callIntervalRef.current);
              setStage('verdict');
              playUiSound('chime');
              return 0;
            }
            if (prev === 31) {
              playUiSound('kick');
            }
            return prev - 1;
          });
        }, 1000);

        if (sess.partner.id.startsWith('ai-')) {
          simulateAIPartnerAudio(sess);
        }
      } catch (err) {
        console.error('Speed date call start failed:', err);
        setStage('verdict');
      }
    },
    [
      cleanupAudio,
      completeMutualMatch,
      currentUser.alias,
      currentUser.avatar,
      currentUser.id,
      handleEarlyBail,
      simulateAIPartnerAudio,
      triggerFloatingReaction,
      waitingPartnerVerdict,
    ]
  );

  const findPartnerAndConnect = useCallback(() => {
    if (!isActiveRef.current) return;

    const candidates = peersRef.current.filter((p) => p.id !== currentUser.id);
    let chosenPartner: SceneUser;

    if (candidates.length > 0) {
      chosenPartner = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      chosenPartner = {
        id: 'ai-tara',
        scene_key: 'SCENE-TARA-99AA',
        alias: 'TaraVibes',
        avatar: { bg: 'from-pink-500 to-rose-700', emoji: '✨' },
        tags: ['🌙 3AM Rants', '🎵 Lo-Fi & Indie', '☕ Chai & Bakchodi'],
        sliders: { talk: 75, owl: 20, hustle: 40 },
        scene_prompt: 'Late night lo-fi and deep talks over tapri chai.',
        scene_aura: 8,
        is_online: true,
        last_seen: new Date().toISOString(),
      };
    }

    const mask = MASKED_CODENAMES[Math.floor(Math.random() * MASKED_CODENAMES.length)];
    const chosenTopic = SPEED_DATE_TOPICS[Math.floor(Math.random() * SPEED_DATE_TOPICS.length)];
    const calculatedMatch = calculateSceneMatch(currentUser, chosenPartner);
    setMatchScore(calculatedMatch);

    // Deterministic 5-minute pairing window bucket so two human peers land in the same WebRTC session
    const pairingWindow = Math.floor(Date.now() / 300000);
    const newSession: SpeedDateSession = {
      sessionId: `spd_${[currentUser.id, chosenPartner.id].sort().join('_')}_${pairingWindow}`,
      partner: chosenPartner,
      maskedAlias: mask.name,
      maskedEmoji: mask.emoji,
      topic: chosenTopic,
      startedAt: Date.now(),
    };

    setSession(newSession);
    setStage('connecting');
    playUiSound('chime');

    connectTimerRef.current = setTimeout(() => {
      if (isActiveRef.current) {
        startLiveVoiceCall(newSession);
      }
    }, 2800);
  }, [currentUser, startLiveVoiceCall]);

  useEffect(() => {
    if (!isOpen) {
      isActiveRef.current = false;
      cleanupAudio();
      return;
    }

    isActiveRef.current = true;
    remoteVerdictRef.current = null;
    playUiSound('pop');

    radarTimerRef.current = setTimeout(() => {
      if (!isActiveRef.current) return;
      findPartnerAndConnect();
    }, 4500);

    return () => {
      isActiveRef.current = false;
      cleanupAudio();
      setStage('radar');
      setTimeLeft(180);
      setIsMuted(false);
      isMutedRef.current = false;
      setIsLocalSpeaking(false);
      setIsRemoteSpeaking(false);
      setIsSubmittingVerdict(false);
      setWaitingPartnerVerdict(false);
      setBailNotice(null);
    };
  }, [isOpen, cleanupAudio, findPartnerAndConnect]);

  const toggleMic = () => {
    if (!rawStreamRef.current) {
      setBailNotice('Microphone permission unavailable in this session.');
      return;
    }
    playUiSound('pop');
    const nextState = !isMuted;
    setIsMuted(nextState);
    isMutedRef.current = nextState;
    if (nextState) setIsLocalSpeaking(false);

    rawStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !nextState));
    if (filterPipelineRef.current) {
      filterPipelineRef.current.outputStream.getAudioTracks().forEach((t) => (t.enabled = !nextState));
    }
    meshRef.current?.broadcastMuteState(nextState);
  };

  const handleFilterChange = (mode: VoiceFilterMode) => {
    playUiSound('click');
    setVoiceFilter(mode);
    filterPipelineRef.current?.setMode(mode);
  };

  const handleFlipTopic = () => {
    playUiSound('pop');
    const remaining = SPEED_DATE_TOPICS.filter((t) => t !== session?.topic);
    const nextTopic = remaining[Math.floor(Math.random() * remaining.length)] || SPEED_DATE_TOPICS[0];
    if (session) {
      setSession({ ...session, topic: nextTopic });
      meshRef.current?.broadcastTopic(nextTopic);
    }
  };

  const handleSendReaction = (emoji: string) => {
    playUiSound('reaction');
    triggerFloatingReaction(emoji);
    meshRef.current?.sendReaction(emoji);
  };

  const handleVerdictSubmit = async (verdict: 'w_scene' | 'pass') => {
    playUiSound('click');
    meshRef.current?.broadcastSpeedVerdict(verdict);

    if (verdict === 'pass') {
      cleanupAudio();
      setStage('passed');
      return;
    }

    if (!session) return;

    setIsSubmittingVerdict(true);
    const isAi = session.partner.id.startsWith('ai-');

    if (isAi || remoteVerdictRef.current === 'w_scene') {
      await completeMutualMatch(session);
      return;
    }

    if (remoteVerdictRef.current === 'pass') {
      cleanupAudio();
      setBailNotice('Partner chose to pass this round.');
      setIsSubmittingVerdict(false);
      setStage('passed');
      return;
    }

    // Real human partner hasn't voted yet: wait briefly, then finalize gracefully if offline/solo
    setWaitingPartnerVerdict(true);
    verdictGraceRef.current = setTimeout(() => {
      if (isActiveRef.current) {
        completeMutualMatch(session);
      }
    }, 3500);
  };

  if (!isOpen) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
      {/* Floating Reactions Canvas */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
        {floatingReactions.map((r) => (
          <div
            key={r.id}
            style={{ left: `${r.x}%` }}
            className="absolute bottom-24 text-4xl animate-float-reaction"
          >
            {r.emoji}
          </div>
        ))}
      </div>

      <div className="relative w-full max-w-xl bg-[#0D0D12] border-2 border-[#CCFF00] rounded-3xl p-5 sm:p-7 shadow-neo overflow-hidden max-h-[92dvh] overflow-y-auto">
        {/* Close / Bail Button */}
        <button
          onClick={() => {
            playUiSound('click');
            cleanupAudio();
            onClose();
          }}
          aria-label="Close speed dating"
          className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors z-20"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ---------------- STAGE 1: RADAR SCANNING ---------------- */}
        {stage === 'radar' && (
          <div className="py-8 sm:py-12 flex flex-col items-center text-center space-y-6">
            <div className="relative w-40 h-40 sm:w-48 sm:h-48 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-[#CCFF00]/20 animate-ping" />
              <div className="absolute inset-4 rounded-full border border-[#CCFF00]/40 animate-pulse" />
              <div className="absolute inset-8 rounded-full border border-violet-500/40" />

              <div className="absolute inset-0 rounded-full overflow-hidden">
                <div className="w-full h-full bg-gradient-to-tr from-transparent via-[#CCFF00]/20 to-transparent animate-spin [animation-duration:3s]" />
              </div>

              <div className="relative z-10 w-16 h-16 rounded-2xl bg-[#111116] border-2 border-[#CCFF00] flex items-center justify-center text-3xl shadow-glow-lime">
                ⚡
              </div>
            </div>

            <div className="space-y-2 max-w-md mx-auto">
              <span className="text-xs font-mono font-bold text-[#CCFF00] uppercase tracking-wider px-3 py-1 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/30 inline-block">
                ⚡ LIVE BLIND VIBE RADAR
              </span>
              <h3 className="text-2xl font-heading font-black text-white">
                Scanning Gen Z Vibe Frequencies...
              </h3>
              <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                Looking for an active peer who matches your talk & hustle sliders. Anonymous voice call connects in 5 seconds.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 justify-center max-w-sm pt-2">
              {(currentUser.tags || []).slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/70"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ---------------- STAGE 2: PRE-CALL CONNECTING ---------------- */}
        {stage === 'connecting' && session && (
          <div className="py-8 text-center space-y-6 animate-fadeIn">
            <span className="text-xs font-mono font-bold text-[#CCFF00] uppercase tracking-wider px-3 py-1 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/30 inline-block">
              🎉 VIBE MATCH FOUND!
            </span>

            <div className="p-6 rounded-3xl bg-[#111116] border-2 border-violet-500/50 shadow-neo-violet max-w-sm mx-auto space-y-3">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-900 border-4 border-[#CCFF00] flex items-center justify-center text-4xl mx-auto shadow-glow-lime animate-bounce">
                {session.maskedEmoji}
              </div>
              <div>
                <h4 className="text-xl font-heading font-black text-white">
                  {session.maskedAlias}
                </h4>
                <span className="text-xs font-mono text-[#CCFF00] font-bold">
                  {matchScore.totalMatch}% Vibe Compatibility
                </span>
              </div>
              <p className="text-xs text-white/50 italic">
                Real alias & profile unlock only if you both swipe &quot;❤️ Match&quot; after 3 minutes!
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#070709] border border-white/10 max-w-md mx-auto text-left">
              <span className="text-[10px] font-mono text-[#CCFF00] uppercase font-bold block mb-1">
                FIRST DEBATE QUESTION:
              </span>
              <p className="text-sm font-heading font-bold text-white italic">
                &quot;{session.topic}&quot;
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs font-mono text-white/50">
              <Radio className="w-4 h-4 text-[#CCFF00] animate-pulse" />
              <span>Connecting live encrypted P2P audio stream...</span>
            </div>
          </div>
        )}

        {/* ---------------- STAGE 3: LIVE 3-MINUTE VOICE CALL ---------------- */}
        {stage === 'in_call' && session && (
          <div className="space-y-5 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 pr-8">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-[#CCFF00] animate-pulse" />
                <span className="text-xl font-mono font-black text-white tracking-wider">
                  {formattedTime}
                </span>
                <span className="text-[11px] font-mono text-white/50 hidden sm:inline">
                  3-Min Blind Date
                </span>
              </div>

              <button
                onClick={() => handleEarlyBail()}
                className="px-3 py-1 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-400 font-mono text-xs flex items-center gap-1 transition-all"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>Bail Out</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 py-2">
              <div className="flex flex-col items-center p-3 sm:p-4 rounded-2xl bg-[#111116] border border-white/10 text-center">
                <div className="relative mb-2">
                  <div
                    className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr ${
                      currentUser.avatar.bg
                    } flex items-center justify-center text-3xl transition-all ${
                      isLocalSpeaking
                        ? 'ring-4 ring-[#CCFF00] ring-offset-2 ring-offset-[#0D0D12] animate-pulse-speaking'
                        : 'border border-white/20'
                    }`}
                  >
                    {currentUser.avatar.emoji}
                  </div>
                  <div
                    className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] border-2 border-[#0D0D12] ${
                      isMuted ? 'bg-rose-500 text-white' : 'bg-[#CCFF00] text-black font-bold'
                    }`}
                  >
                    {isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                  </div>
                </div>
                <span className="font-heading font-bold text-xs text-white truncate max-w-full">
                  You ({currentUser.alias})
                </span>
                <span className="text-[10px] font-mono text-white/50">
                  {voiceFilter !== 'natural' ? `Mask: ${voiceFilter}` : 'Natural Mic'}
                </span>
              </div>

              <div className="flex flex-col items-center p-3 sm:p-4 rounded-2xl bg-[#111116] border border-violet-500/30 text-center">
                <div className="relative mb-2">
                  <div
                    className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-900 flex items-center justify-center text-3xl transition-all ${
                      isRemoteSpeaking
                        ? 'ring-4 ring-[#CCFF00] ring-offset-2 ring-offset-[#0D0D12] animate-pulse-speaking'
                        : 'border border-violet-400/30'
                    }`}
                  >
                    {session.maskedEmoji}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#CCFF00] text-black font-bold flex items-center justify-center text-[10px] border-2 border-[#0D0D12]">
                    <Mic className="w-3 h-3" />
                  </div>
                </div>
                <span className="font-heading font-bold text-xs text-white truncate max-w-full">
                  {session.maskedAlias} 🔒
                </span>
                <span className="text-[10px] font-mono text-[#CCFF00]">
                  {matchScore.totalMatch}% Vibe Match
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#070709] border border-white/15 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-[#CCFF00] uppercase font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>DEBATE QUESTION:</span>
                </span>
                <p className="text-sm font-heading font-bold text-white italic">
                  &quot;{session.topic}&quot;
                </p>
              </div>
              <button
                onClick={handleFlipTopic}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white flex-shrink-0"
                title="Flip to next question"
              >
                <Dices className="w-4 h-4 text-[#CCFF00]" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-2 py-1 flex-wrap">
              {['💖', '🔥', '😂', '💀', '👏', '🍕'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleSendReaction(emoji)}
                  className="text-xl p-1.5 rounded-xl bg-white/5 hover:bg-white/15 hover:scale-125 transition-all"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-1 flex-wrap justify-center">
                {(
                  [
                    { mode: 'natural', label: '🎙️ Clean' },
                    { mode: 'deep', label: '🕵️ Deep' },
                    { mode: 'helium', label: '✨ Sparkle' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.mode}
                    onClick={() => handleFilterChange(f.mode)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all ${
                      voiceFilter === f.mode
                        ? 'bg-[#CCFF00] text-black font-bold border-black'
                        : 'bg-[#15151c] text-white/60 border-white/10'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMic}
                  className={`px-4 py-2 rounded-xl font-heading font-bold text-xs flex items-center gap-1.5 border transition-all ${
                    isMuted
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-[#CCFF00] text-black border-black font-black shadow-neo-sm'
                  }`}
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                </button>

                {timeLeft < 120 && (
                  <button
                    onClick={() => {
                      if (callIntervalRef.current) clearInterval(callIntervalRef.current);
                      setStage('verdict');
                      playUiSound('chime');
                    }}
                    className="neo-btn-lime px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1"
                  >
                    <Heart className="w-3.5 h-3.5 fill-black" />
                    <span>Match Early</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---------------- STAGE 4: VERDICT TIME ---------------- */}
        {stage === 'verdict' && session && (
          <div className="py-6 text-center space-y-6 animate-fadeIn">
            <div className="space-y-1">
              <span className="text-xs font-mono font-bold text-[#CCFF00] uppercase tracking-wider px-3 py-1 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/30 inline-block">
                ⌛ 3 MINUTES COMPLETED!
              </span>
              <h3 className="text-2xl sm:text-3xl font-heading font-black text-white">
                Did You Feel The Vibe?
              </h3>
              <p className="text-xs sm:text-sm text-white/60 max-w-sm mx-auto">
                If you both press &quot;❤️ W Scene&quot;, your real identities unlock and a direct chat opens immediately!
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#111116] border border-white/10 max-w-xs mx-auto flex items-center justify-center gap-3">
              <span className="text-3xl">{session.maskedEmoji}</span>
              <div className="text-left">
                <div className="font-heading font-bold text-white text-sm">
                  {session.maskedAlias}
                </div>
                <div className="text-[11px] font-mono text-[#CCFF00]">
                  {matchScore.totalMatch}% Match Score
                </div>
              </div>
            </div>

            {waitingPartnerVerdict ? (
              <div className="p-4 rounded-2xl bg-[#CCFF00]/10 border border-[#CCFF00]/40 text-xs font-mono text-[#CCFF00] max-w-sm mx-auto animate-pulse">
                ✨ You locked W Scene! Syncing partner verdict...
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-md mx-auto pt-2">
                <button
                  onClick={() => handleVerdictSubmit('pass')}
                  disabled={isSubmittingVerdict}
                  className="py-4 rounded-2xl bg-[#15151c] hover:bg-rose-500/20 border border-white/20 hover:border-rose-400 text-white/80 hover:text-rose-300 font-heading font-bold text-sm flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-50"
                >
                  <span className="text-2xl">👋</span>
                  <span>Pass (Keep Moving)</span>
                </button>

                <button
                  onClick={() => handleVerdictSubmit('w_scene')}
                  disabled={isSubmittingVerdict}
                  className="py-4 rounded-2xl neo-btn-lime text-black font-heading font-black text-sm flex flex-col items-center justify-center gap-1 shadow-neo transition-all disabled:opacity-50"
                >
                  <span className="text-2xl">❤️</span>
                  <span>{isSubmittingVerdict ? 'Connecting Vibe...' : 'W Scene (I Vibe!)'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ---------------- STAGE 5: MATCHED CELEBRATION ---------------- */}
        {stage === 'matched' && session && (
          <div className="py-8 text-center space-y-6 animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-[#CCFF00]/20 border-2 border-[#CCFF00] flex items-center justify-center text-3xl mx-auto shadow-glow-lime animate-bounce">
              ❤️
            </div>

            <div className="space-y-1">
              <h3 className="text-3xl font-heading font-black text-white">
                It&apos;s a Mutual W Scene! ⚡
              </h3>
              <p className="text-sm text-white/70">
                Both of you felt the chemistry. Real identities are now unmasked!
              </p>
            </div>

            <div className="p-5 rounded-3xl bg-[#111116] border-2 border-[#CCFF00] shadow-neo max-w-sm mx-auto flex items-center gap-4 text-left">
              <div
                className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${
                  session.partner.avatar.bg
                } flex items-center justify-center text-2xl shadow-md border border-white/20 flex-shrink-0`}
              >
                {session.partner.avatar.emoji}
              </div>
              <div className="min-w-0">
                <h4 className="font-heading font-black text-white text-base truncate">
                  {session.partner.alias}
                </h4>
                <span className="text-xs font-mono text-[#CCFF00] font-bold">
                  +{session.partner.scene_aura} Aura ⚡
                </span>
                <p className="text-xs text-white/60 line-clamp-1 mt-0.5 italic">
                  &quot;{session.partner.scene_prompt}&quot;
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  playUiSound('click');
                  onClose();
                  onOpenChat(session.partner);
                }}
                className="w-full max-w-xs neo-btn-lime py-3.5 rounded-2xl font-heading font-black text-sm inline-flex items-center justify-center gap-2 shadow-neo"
              >
                <MessageCircle className="w-4 h-4 fill-black" />
                <span>Open 1-on-1 Chat With {session.partner.alias}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ---------------- STAGE 6: PASSED / NO MATCH ---------------- */}
        {stage === 'passed' && (
          <div className="py-8 text-center space-y-5 animate-fadeIn">
            <div className="text-4xl">👋</div>
            <div className="space-y-1">
              <h3 className="text-2xl font-heading font-black text-white">
                {bailNotice ? 'Round Ended' : 'No Hard Feelings!'}
              </h3>
              <p className="text-xs sm:text-sm text-white/60 max-w-sm mx-auto">
                {bailNotice ||
                  'Finding the right vibe is all about exploring. Your next 3-minute match is just 1 tap away!'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => {
                  playUiSound('click');
                  onClose();
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-mono text-xs border border-white/10"
              >
                Back to Feed
              </button>

              <button
                onClick={() => {
                  playUiSound('pop');
                  setBailNotice(null);
                  setStage('radar');
                  setTimeLeft(180);
                  setIsSubmittingVerdict(false);
                  setWaitingPartnerVerdict(false);
                  isActiveRef.current = true;
                  radarTimerRef.current = setTimeout(() => {
                    findPartnerAndConnect();
                  }, 4000);
                }}
                className="w-full sm:w-auto neo-btn-lime px-6 py-2.5 rounded-xl font-heading font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5 fill-black" />
                <span>Match With Someone Else</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
