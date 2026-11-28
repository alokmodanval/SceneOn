import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, PieceSymbol, Square } from 'chess.js';
import confetti from 'canvas-confetti';
import {
  ArrowUpDown,
  Check,
  Clock,
  Copy,
  Flag,
  Handshake,
  Key,
  Link2,
  Loader2,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  ShieldCheck,
  Swords,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  ChessGameState,
  ChessHistoryRecord,
  ChessPlayerInfo,
  FriendsDataPayload,
  RoomChatMessage,
  SceneUser,
} from '../types';
import {
  CHESS_PIECE_SVGS,
  CHESS_TIME_OPTIONS,
  computeMaterialSummary,
  formatChessClock,
  loadChessGame,
  pickBotMove,
  playChessSound,
} from '../lib/chessHelpers';
import {
  createSilentAudioStream,
  createVolumeMeter,
  playUiSound,
} from '../lib/audioEngine';
import {
  createNewSceneUser,
  generateRandomAvatar,
  normalizeUsernameInput,
  saveCurrentUser,
  suggestUsernameFromName,
} from '../lib/identity';
import { lobbySocket } from '../lib/lobbySocket';
import { WebRTCMeshRoom } from '../lib/webrtcMesh';
import {
  checkUsernameAvailability,
  registerOrUpdateSceneUser,
  saveLocalChessHistoryRecord,
  sendChessInvite,
} from '../lib/supabase';
import { PreGameMediaModal } from './PreGameMediaModal';
import { FriendsAndHistoryPanel } from './FriendsAndHistoryPanel';
import { OnlineBlueTick } from './OnlineBlueTick';

export interface ExternalChallengeRequest {
  launchKey: string;
  gameId: string;
  timeControlMs: number;
  preferredColor: 'w' | 'b';
  opponent?: ChessPlayerInfo;
}

interface ChessArenaProps {
  currentUser: SceneUser | null;
  onlineUserIds: string[];
  friendsData: FriendsDataPayload;
  history: ChessHistoryRecord[];
  initialGameId?: string | null;
  initialTimeControlMs?: number;
  externalChallengeRequest?: ExternalChallengeRequest | null;
  onClearExternalChallenge?: () => void;
  onClearInitialGame?: () => void;
  onQuickUserCreated: (user: SceneUser) => void;
  onOpenRestore: () => void;
  onSignOut?: () => void;
  onSendFriendRequest: (target: { toUserId?: string; toUsername?: string }) => Promise<string>;
  onRespondFriendRequest: (requesterId: string, action: 'accept' | 'decline') => Promise<void>;
  onRemoveFriend: (friendId: string) => Promise<void>;
  onOpenChat?: (user: SceneUser) => void;
  onRefreshSocialData: () => Promise<void>;
}

type PendingLaunch =
  | { kind: 'random'; timeControlMs: number }
  | { kind: 'friend_link'; timeControlMs: number }
  | { kind: 'direct_invite'; friend: ChessPlayerInfo; timeControlMs: number }
  | { kind: 'join_game'; gameId: string; timeControlMs: number; opponent?: ChessPlayerInfo }
  | { kind: 'bot'; timeControlMs: number };

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS_WHITE = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;
const RANKS_BLACK = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
const FILES_BLACK = ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] as const;
const QUICK_EMOJIS = ['♟️', '👑', '⚡', '🔥', '🎧', '🦊'];

const PieceIcon: React.FC<{
  type: PieceSymbol;
  color: 'w' | 'b';
  sizeClass?: string;
}> = ({ type, color, sizeClass = 'w-7 h-7 sm:w-9 sm:h-9' }) => {
  const isWhite = color === 'w';
  return (
    <svg
      viewBox="0 0 45 45"
      className={`${sizeClass} select-none pointer-events-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.65)]`}
    >
      <g
        fill={isWhite ? '#FFFFFF' : '#11131A'}
        stroke={isWhite ? '#0F172A' : '#E2E8F0'}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {CHESS_PIECE_SVGS[type].map((d, idx) => (
          <path key={idx} d={d} />
        ))}
      </g>
    </svg>
  );
};

function createInitialGameState(
  timeControlMs: number,
  white: ChessPlayerInfo | null = null,
  black: ChessPlayerInfo | null = null
): ChessGameState {
  return {
    fen: new Chess().fen(),
    pgn: '',
    status: white && black ? 'active' : 'waiting',
    winner: null,
    turn: 'w',
    white,
    black,
    timeControlMs,
    whiteTimeMs: timeControlMs,
    blackTimeMs: timeControlMs,
    lastMoveAt: null,
    lastMove: null,
    drawOfferBy: null,
    moveCount: 0,
  };
}

export const ChessArena: React.FC<ChessArenaProps> = ({
  currentUser,
  onlineUserIds,
  friendsData,
  history,
  initialGameId,
  initialTimeControlMs,
  externalChallengeRequest,
  onClearExternalChallenge,
  onClearInitialGame,
  onQuickUserCreated,
  onOpenRestore,
  onSignOut,
  onSendFriendRequest,
  onRespondFriendRequest,
  onRemoveFriend,
  onOpenChat,
  onRefreshSocialData,
}) => {
  const [viewMode, setViewMode] = useState<'lobby' | 'searching' | 'game'>('lobby');
  const [gameMode, setGameMode] = useState<'online' | 'bot'>('online');
  const [selectedTimeMs, setSelectedTimeMs] = useState<number>(initialTimeControlMs || 300000);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [myColor, setMyColor] = useState<'w' | 'b'>('w');
  const [preferredColor, setPreferredColor] = useState<'w' | 'b'>('w');
  const [boardOrientation, setBoardOrientation] = useState<'w' | 'b'>('w');

  // Pre-Game Camera & Mic Permission Gate state
  const [pendingLaunch, setPendingLaunch] = useState<PendingLaunch | null>(() =>
    initialGameId && currentUser
      ? {
          kind: 'join_game',
          gameId: initialGameId,
          timeControlMs: initialTimeControlMs || 300000,
        }
      : null
  );

  // Instant First-Screen Name + @username Signup Card state (when !currentUser)
  const [quickName, setQuickName] = useState('');
  const [quickUsername, setQuickUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [quickEmoji, setQuickEmoji] = useState('♟️');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [signupError, setSignupError] = useState('');
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);

  // Active Match & Showcase Board State
  const [chessState, setChessState] = useState<ChessGameState>(() =>
    createInitialGameState(initialTimeControlMs || 300000)
  );
  const [showcaseFen, setShowcaseFen] = useState<string>(() => new Chess().fen());
  const [showcaseSelected, setShowcaseSelected] = useState<Square | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [friendReqSentIds, setFriendReqSentIds] = useState<Record<string, boolean>>({});
  const [clockNow, setClockNow] = useState<number>(() => Date.now());

  // WebRTC Voice & Video State (Privacy Toggleable Mid-Game)
  const [wsConnected, setWsConnected] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [speakerVolume, setSpeakerVolume] = useState(1);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
  const [isRemoteMuted, setIsRemoteMuted] = useState(true);
  const [isRemoteCameraOn, setIsRemoteCameraOn] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteMediaStream, setRemoteMediaStream] = useState<MediaStream | null>(null);
  const [mediaNotice, setMediaNotice] = useState<string>('');

  // Side chat & reactions
  const [rightTab, setRightTab] = useState<'chat' | 'moves'>('chat');
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: string; emoji: string; x: number }[]>([]);

  const meshRef = useRef<WebRTCMeshRoom | null>(null);
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const localCamStreamRef = useRef<MediaStream | null>(null);
  const preApprovedMediaRef = useRef<{
    stream: MediaStream;
    cameraOn: boolean;
    micMuted: boolean;
  } | null>(null);
  const localMeterRef = useRef<(() => void) | null>(null);
  const remoteMeterRef = useRef<(() => void) | null>(null);
  const localVideoElRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoElRef = useRef<HTMLVideoElement | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMutedRef = useRef(isMicMuted);
  const viewModeRef = useRef(viewMode);
  const lastHandledChallengeRef = useRef<string | null>(null);
  const recordedLocalBotIdRef = useRef<string | null>(null);

  useEffect(() => {
    isMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  // Live check @username availability while user types on Screen 1
  useEffect(() => {
    const clean = normalizeUsernameInput(quickUsername);
    if (clean.length < 3) return;
    const timer = window.setTimeout(async () => {
      setUsernameStatus('checking');
      const res = await checkUsernameAvailability(clean);
      setUsernameStatus(res.available ? 'available' : 'taken');
    }, 350);
    return () => window.clearTimeout(timer);
  }, [quickUsername]);

  // Handle incoming Friend Challenge accepted from Header Notification Bell / Toast
  useEffect(() => {
    if (!externalChallengeRequest || !currentUser) return;
    if (lastHandledChallengeRef.current === externalChallengeRequest.launchKey) return;
    lastHandledChallengeRef.current = externalChallengeRequest.launchKey;

    Promise.resolve().then(() => {
      setPendingLaunch({
        kind: 'join_game',
        gameId: externalChallengeRequest.gameId,
        timeControlMs: externalChallengeRequest.timeControlMs,
        opponent: externalChallengeRequest.opponent,
      });
      onClearExternalChallenge?.();
    });
  }, [externalChallengeRequest, currentUser, onClearExternalChallenge]);

  useEffect(() => {
    if (localVideoElRef.current) {
      localVideoElRef.current.srcObject = isCameraOn ? localVideoStream : null;
    }
  }, [isCameraOn, localVideoStream]);

  useEffect(() => {
    if (remoteVideoElRef.current) {
      remoteVideoElRef.current.srcObject = isRemoteCameraOn ? remoteMediaStream : null;
    }
  }, [isRemoteCameraOn, remoteMediaStream]);

  const stopAllMediaAndSocket = useCallback(() => {
    if (botTimerRef.current) {
      clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }
    if (localMeterRef.current) {
      localMeterRef.current();
      localMeterRef.current = null;
    }
    if (remoteMeterRef.current) {
      remoteMeterRef.current();
      remoteMeterRef.current = null;
    }
    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getTracks().forEach((t) => t.stop());
      localAudioStreamRef.current = null;
    }
    if (localCamStreamRef.current) {
      localCamStreamRef.current.getTracks().forEach((t) => t.stop());
      localCamStreamRef.current = null;
    }
    if (preApprovedMediaRef.current) {
      preApprovedMediaRef.current.stream.getTracks().forEach((t) => t.stop());
      preApprovedMediaRef.current = null;
    }
    if (meshRef.current) {
      meshRef.current.leave();
      meshRef.current = null;
    }
    setLocalVideoStream(null);
    setRemoteMediaStream(null);
    setIsCameraOn(false);
    setIsRemoteCameraOn(false);
    setIsMicMuted(false);
    setIsLocalSpeaking(false);
    setIsRemoteSpeaking(false);
    setRemoteConnected(false);
    setWsConnected(false);
  }, []);

  const triggerReaction = useCallback((emoji: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const x = 15 + Math.random() * 70;
    setFloatingEmojis((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((item) => item.id !== id));
    }, 1800);
  }, []);

  // Boot Bot Practice Camera preview cleanly if approved in PreGameMediaModal
  useEffect(() => {
    if (viewMode !== 'game' || gameMode !== 'bot') return;
    const pre = preApprovedMediaRef.current;
    if (!pre) return;
    preApprovedMediaRef.current = null;

    Promise.resolve().then(() => {
      localAudioStreamRef.current = pre.stream;
      setIsMicMuted(pre.micMuted);
      isMutedRef.current = pre.micMuted;
      if (pre.cameraOn && pre.stream.getVideoTracks().length > 0) {
        const camOnly = new MediaStream(pre.stream.getVideoTracks());
        localCamStreamRef.current = pre.stream;
        setLocalVideoStream(camOnly);
        setIsCameraOn(true);
      } else {
        setIsCameraOn(false);
      }
      if (pre.stream.getAudioTracks().length > 0) {
        localMeterRef.current = createVolumeMeter(pre.stream, (_lvl, speaking) => {
          setIsLocalSpeaking(speaking && !isMutedRef.current);
        });
      }
    });

    return () => {
      stopAllMediaAndSocket();
    };
  }, [viewMode, gameMode, activeGameId, stopAllMediaAndSocket]);

  // Connect WebRTC + Durable Object /ws/chess/:gameId when an online match opens
  useEffect(() => {
    if (viewMode !== 'game' || gameMode !== 'online' || !activeGameId || !currentUser) {
      return;
    }

    let cancelled = false;

    const bootOnlineMatch = async () => {
      let baseStream: MediaStream;
      let startCamOn = false;
      let startMicMuted = false;

      if (preApprovedMediaRef.current) {
        const handoff = preApprovedMediaRef.current;
        preApprovedMediaRef.current = null;
        baseStream = handoff.stream;
        startCamOn = handoff.cameraOn && baseStream.getVideoTracks().length > 0;
        startMicMuted = handoff.micMuted;
      } else {
        // Fallback request if user navigated straight in
        try {
          baseStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
              sampleRate: 48000,
            },
          });
          startCamOn = baseStream.getVideoTracks().length > 0;
        } catch {
          try {
            baseStream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
              video: false,
            });
          } catch {
            baseStream = createSilentAudioStream();
            startMicMuted = true;
          }
        }
      }

      if (cancelled) {
        baseStream.getTracks().forEach((t) => t.stop());
        return;
      }

      localAudioStreamRef.current = baseStream;
      baseStream.getAudioTracks().forEach((t) => {
        t.enabled = !startMicMuted;
      });
      setIsMicMuted(startMicMuted);
      isMutedRef.current = startMicMuted;

      if (startCamOn) {
        const camStream = new MediaStream(baseStream.getVideoTracks());
        localCamStreamRef.current = baseStream;
        setLocalVideoStream(camStream);
        setIsCameraOn(true);
      } else {
        setLocalVideoStream(null);
        setIsCameraOn(false);
      }

      if (baseStream.getAudioTracks().length > 0) {
        localMeterRef.current = createVolumeMeter(baseStream, (_lvl, speaking) => {
          const active = speaking && !isMutedRef.current;
          setIsLocalSpeaking(active);
          meshRef.current?.broadcastSpeaking(active);
        });
      }

      const mesh = new WebRTCMeshRoom(
        `chess_${activeGameId}`,
        currentUser.id,
        currentUser.alias,
        {
          onSocketStatus: (connected) => {
            if (!cancelled) setWsConnected(connected);
          },
          onRemoteStream: (_peerId, remoteStream) => {
            if (cancelled) return;
            setRemoteMediaStream(remoteStream);
            setRemoteConnected(true);
            if (remoteMeterRef.current) remoteMeterRef.current();
            if (remoteStream.getAudioTracks().length > 0) {
              remoteMeterRef.current = createVolumeMeter(remoteStream, (_lvl, speaking) => {
                setIsRemoteSpeaking(speaking);
              });
            }
          },
          onPeerJoin: (p) => {
            if (cancelled) return;
            setRemoteConnected(true);
            setIsRemoteMuted(p.is_muted ?? false);
            setIsRemoteCameraOn(Boolean(p.is_camera_on));
          },
          onPeerLeave: () => {
            if (cancelled) return;
            setRemoteConnected(false);
            setIsRemoteCameraOn(false);
            setIsRemoteSpeaking(false);
            setRemoteMediaStream(null);
          },
          onPeerSpeaking: (_uid, speaking) => {
            if (!cancelled) setIsRemoteSpeaking(speaking);
          },
          onPeerMuteChange: (_uid, muted) => {
            if (!cancelled) setIsRemoteMuted(muted);
          },
          onPeerCameraChange: (_uid, camOn) => {
            if (!cancelled) setIsRemoteCameraOn(camOn);
          },
          onReaction: (emoji) => {
            if (!cancelled) triggerReaction(emoji);
          },
          onRoomChat: (msg) => {
            if (!cancelled) {
              setChatMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
            }
          },
          onTopicChange: () => {},
          onRawMessage: (raw) => {
            if (cancelled) return;
            if (raw.type === 'chess_sync' && raw.state) {
              const incoming = raw.state as ChessGameState;
              setChessState(incoming);
              if (incoming.white?.id === currentUser.id) {
                setMyColor('w');
                setBoardOrientation('w');
              } else if (incoming.black?.id === currentUser.id) {
                setMyColor('b');
                setBoardOrientation('b');
              }
            }
          },
        },
        currentUser.avatar,
        startMicMuted,
        {
          wsPath: `/ws/chess/${encodeURIComponent(activeGameId)}`,
          enableVideoSlot: true,
          initialCameraOn: startCamOn,
        }
      );

      meshRef.current = mesh;
      mesh.sendCustomJson({
        type: 'chess_join',
        user: {
          id: currentUser.id,
          alias: currentUser.alias,
          username: currentUser.username,
          avatar: currentUser.avatar,
        },
        preferredColor,
        timeControlMs: selectedTimeMs,
      });

      await mesh.start(baseStream, 'speaker', 1);

      if (cancelled) {
        mesh.leave();
      }
    };

    void bootOnlineMatch();

    return () => {
      cancelled = true;
      stopAllMediaAndSocket();
    };
  }, [
    viewMode,
    gameMode,
    activeGameId,
    currentUser,
    preferredColor,
    selectedTimeMs,
    stopAllMediaAndSocket,
    triggerReaction,
  ]);

  // Listen for random opponent pairing on global LobbyHub
  useEffect(() => {
    if (viewMode !== 'searching' || !currentUser) return;

    lobbySocket.joinChessQueue(
      {
        id: currentUser.id,
        alias: currentUser.alias,
        username: currentUser.username,
        avatar: currentUser.avatar,
      },
      selectedTimeMs
    );

    const unsub = lobbySocket.subscribe((event) => {
      if (event.type === 'chess_matched' && viewModeRef.current === 'searching') {
        playChessSound('notify');
        lobbySocket.leaveChessQueue();
        setPreferredColor(event.color);
        setMyColor(event.color);
        setBoardOrientation(event.color);
        setSelectedTimeMs(event.timeControlMs);
        setActiveGameId(event.gameId);
        setGameMode('online');
        const mePlayer: ChessPlayerInfo = {
          id: currentUser.id,
          alias: currentUser.alias,
          username: currentUser.username,
          avatar: currentUser.avatar,
        };
        setChessState(
          createInitialGameState(
            event.timeControlMs,
            event.color === 'w' ? mePlayer : event.opponent,
            event.color === 'b' ? mePlayer : event.opponent
          )
        );
        setChatMessages([]);
        setViewMode('game');
      }
    });

    return () => {
      unsub();
      lobbySocket.leaveChessQueue();
    };
  }, [viewMode, currentUser, selectedTimeMs]);

  // Smooth clock tick
  useEffect(() => {
    if (viewMode !== 'game' || chessState.status !== 'active' || chessState.moveCount === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      const now = Date.now();
      setClockNow(now);

      if (chessState.lastMoveAt) {
        const elapsed = Math.max(0, now - chessState.lastMoveAt);
        const remaining =
          chessState.turn === 'w'
            ? chessState.whiteTimeMs - elapsed
            : chessState.blackTimeMs - elapsed;

        if (remaining <= 0) {
          if (gameMode === 'online' && meshRef.current && wsConnected) {
            meshRef.current.sendCustomJson({
              type: 'chess_timeout',
              color: chessState.turn,
            });
          } else {
            const loser = chessState.turn;
            setChessState((prev) =>
              prev.status === 'active'
                ? {
                    ...prev,
                    status: 'timeout',
                    winner: loser === 'w' ? 'b' : 'w',
                    whiteTimeMs: loser === 'w' ? 0 : prev.whiteTimeMs,
                    blackTimeMs: loser === 'b' ? 0 : prev.blackTimeMs,
                  }
                : prev
            );
          }
        }
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [
    viewMode,
    chessState.status,
    chessState.moveCount,
    chessState.lastMoveAt,
    chessState.turn,
    chessState.whiteTimeMs,
    chessState.blackTimeMs,
    gameMode,
    wsConnected,
  ]);

  // Record finished games locally (for bot) + celebrate + refresh D1 history
  const prevStatusRef = useRef(chessState.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = chessState.status;
    if (
      prev !== chessState.status &&
      (chessState.status === 'checkmate' ||
        chessState.status === 'resigned' ||
        chessState.status === 'timeout' ||
        chessState.status === 'draw')
    ) {
      playChessSound('gameover');
      if (chessState.winner === myColor) {
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#CCFF00', '#00F0FF', '#8B5CF6'],
        });
      }

      if (gameMode === 'bot' && chessState.white && chessState.black) {
        const recId = `bot_${Date.now()}`;
        if (recordedLocalBotIdRef.current !== activeGameId) {
          recordedLocalBotIdRef.current = activeGameId;
          saveLocalChessHistoryRecord({
            id: recId,
            timeControlMs: chessState.timeControlMs,
            status: chessState.status,
            winnerSide: chessState.winner,
            whiteId: chessState.white.id,
            whiteAlias: chessState.white.alias,
            whiteUsername: chessState.white.username,
            whiteAvatar: chessState.white.avatar,
            blackId: chessState.black.id,
            blackAlias: chessState.black.alias,
            blackUsername: chessState.black.username,
            blackAvatar: chessState.black.avatar,
            pgn: chessState.pgn,
            fen: chessState.fen,
            moveCount: chessState.moveCount,
            createdAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            isBot: true,
          });
        }
      }
      void onRefreshSocialData();
    }
  }, [
    chessState.status,
    chessState.winner,
    chessState.white,
    chessState.black,
    chessState.pgn,
    chessState.fen,
    chessState.moveCount,
    chessState.timeControlMs,
    myColor,
    gameMode,
    activeGameId,
    onRefreshSocialData,
  ]);

  const chessInstance = useMemo(
    () => loadChessGame(chessState.fen, chessState.pgn),
    [chessState.fen, chessState.pgn]
  );

  const showcaseChess = useMemo(() => loadChessGame(showcaseFen), [showcaseFen]);

  const legalDestinations = useMemo(() => {
    if (!selectedSquare) return new Map<string, boolean>();
    const map = new Map<string, boolean>();
    try {
      const moves = chessInstance.moves({ square: selectedSquare, verbose: true });
      for (const m of moves) map.set(m.to, Boolean(m.captured));
    } catch {
      // Ignore
    }
    return map;
  }, [chessInstance, selectedSquare]);

  const showcaseLegal = useMemo(() => {
    if (!showcaseSelected) return new Map<string, boolean>();
    const map = new Map<string, boolean>();
    try {
      const moves = showcaseChess.moves({ square: showcaseSelected, verbose: true });
      for (const m of moves) map.set(m.to, Boolean(m.captured));
    } catch {
      // Ignore
    }
    return map;
  }, [showcaseChess, showcaseSelected]);

  const material = useMemo(() => computeMaterialSummary(chessState.fen), [chessState.fen]);

  const applyLocalMove = useCallback(
    (from: Square, to: Square, promotion: 'q' | 'r' | 'b' | 'n' = 'q') => {
      const now = Date.now();
      setChessState((prev) => {
        const game = loadChessGame(prev.fen, prev.pgn);
        let mv;
        try {
          mv = game.move({ from, to, promotion });
        } catch {
          return prev;
        }
        if (!mv) return prev;

        playChessSound(game.inCheck() ? 'check' : mv.captured ? 'capture' : 'move');

        let nextW = prev.whiteTimeMs;
        let nextB = prev.blackTimeMs;
        if (prev.lastMoveAt && prev.moveCount > 0) {
          const elapsed = Math.max(0, now - prev.lastMoveAt);
          if (prev.turn === 'w') nextW = Math.max(0, nextW - elapsed);
          else nextB = Math.max(0, nextB - elapsed);
        }

        let status: ChessGameState['status'] = 'active';
        let winner: ChessGameState['winner'] = null;
        if (game.isCheckmate()) {
          status = 'checkmate';
          winner = mv.color;
        } else if (game.isDraw()) {
          status = 'draw';
          winner = 'draw';
        }

        return {
          ...prev,
          fen: game.fen(),
          pgn: game.pgn(),
          turn: game.turn(),
          status,
          winner,
          whiteTimeMs: nextW,
          blackTimeMs: nextB,
          lastMoveAt: now,
          lastMove: { from: mv.from, to: mv.to, san: mv.san },
          drawOfferBy: null,
          moveCount: prev.moveCount + 1,
        };
      });
    },
    []
  );

  // Bot reply turn
  useEffect(() => {
    if (viewMode !== 'game' || gameMode !== 'bot') return;
    if (chessState.status !== 'active') return;
    if (chessState.turn === myColor) return;

    botTimerRef.current = setTimeout(() => {
      const mv = pickBotMove(chessState.fen);
      if (mv) {
        applyLocalMove(mv.from as Square, mv.to as Square, mv.promotion || 'q');
      }
    }, 550);

    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, [viewMode, gameMode, chessState.status, chessState.turn, chessState.fen, myColor, applyLocalMove]);

  const executePlayerMove = (from: Square, to: Square, promotion: 'q' | 'r' | 'b' | 'n' = 'q') => {
    const testGame = loadChessGame(chessState.fen, chessState.pgn);
    try {
      const mv = testGame.move({ from, to, promotion });
      if (!mv) return;
      if (gameMode === 'online' && meshRef.current && wsConnected) {
        playChessSound(testGame.inCheck() ? 'check' : mv.captured ? 'capture' : 'move');
      }
    } catch {
      return;
    }

    setSelectedSquare(null);
    setPendingPromotion(null);

    if (gameMode === 'online' && meshRef.current && wsConnected) {
      meshRef.current.sendCustomJson({ type: 'chess_move', from, to, promotion });
    } else {
      applyLocalMove(from, to, promotion);
    }
  };

  const handleSquareClick = (sq: Square) => {
    if (chessState.status !== 'active' && chessState.status !== 'waiting') return;
    if (gameMode === 'online' && chessState.status === 'waiting') {
      setMediaNotice('Waiting for your opponent to accept the challenge or open the invite link!');
      setTimeout(() => setMediaNotice(''), 2500);
      return;
    }
    if (chessState.turn !== myColor) return;

    const piece = chessInstance.get(sq);
    if (selectedSquare) {
      if (selectedSquare === sq) {
        setSelectedSquare(null);
        return;
      }
      if (legalDestinations.has(sq)) {
        const movingPiece = chessInstance.get(selectedSquare);
        const isPromo =
          movingPiece?.type === 'p' &&
          ((movingPiece.color === 'w' && sq[1] === '8') ||
            (movingPiece.color === 'b' && sq[1] === '1'));
        if (isPromo) setPendingPromotion({ from: selectedSquare, to: sq });
        else executePlayerMove(selectedSquare, sq, 'q');
        return;
      }
      if (piece && piece.color === myColor) {
        setSelectedSquare(sq);
        return;
      }
      setSelectedSquare(null);
      return;
    }

    if (piece && piece.color === myColor) {
      setSelectedSquare(sq);
    }
  };

  // Interactive Sandbox Board right on Screen 1 Showcase before launch
  const handleShowcaseSquareClick = (sq: Square) => {
    const piece = showcaseChess.get(sq);
    if (showcaseSelected) {
      if (showcaseSelected === sq) {
        setShowcaseSelected(null);
        return;
      }
      if (showcaseLegal.has(sq)) {
        const g = loadChessGame(showcaseFen);
        try {
          const mv = g.move({ from: showcaseSelected, to: sq, promotion: 'q' });
          if (mv) {
            playChessSound(g.inCheck() ? 'check' : mv.captured ? 'capture' : 'move');
            setShowcaseFen(g.fen());
            setShowcaseSelected(null);
            return;
          }
        } catch {
          // Ignore
        }
      }
      if (piece && piece.color === showcaseChess.turn()) {
        setShowcaseSelected(sq);
        return;
      }
      setShowcaseSelected(null);
      return;
    }
    if (piece && piece.color === showcaseChess.turn()) {
      setShowcaseSelected(sq);
    }
  };

  // Instant Profile Creation on First Screen (Name + Unique @username)
  const ensureProfileAndLaunch = async (launchAfter: PendingLaunch) => {
    if (currentUser) {
      setPendingLaunch(launchAfter);
      return;
    }

    const cleanName = quickName.trim();
    const cleanHandle = normalizeUsernameInput(quickUsername);
    if (!cleanName) {
      setSignupError('Apna Name likho (e.g. Alok) to shuru karein!');
      return;
    }
    if (cleanHandle.length < 3) {
      setSignupError('Username kam se kam 3 letters/numbers ka rakho (e.g. alok_99).');
      return;
    }
    if (usernameStatus === 'taken') {
      setSignupError(`@${cleanHandle} pehle se liya ja chuka hai — koi aur try karein.`);
      return;
    }

    setSignupError('');
    setIsCreatingProfile(true);
    const av = generateRandomAvatar();
    const newUser = createNewSceneUser({
      alias: cleanName,
      username: cleanHandle,
      avatar: { bg: av.bg, emoji: quickEmoji },
      tags: ['💻 Coding & Dev', '☕ Chai & Bakchodi', '🎮 Valorant / BGMI'],
      sliders: { talk: 65, owl: 25, hustle: 60 },
      scene_prompt: 'Playing Live Chess + Video Chat on ChessChat!',
    });

    const res = await registerOrUpdateSceneUser(newUser);
    setIsCreatingProfile(false);

    if (res.status === 409) {
      setUsernameStatus('taken');
      setSignupError(res.error || 'Username already taken!');
      localStorage.removeItem('sceneon_current_user');
      return;
    }

    const finalUser = res.user || newUser;
    saveCurrentUser(finalUser);
    onQuickUserCreated(finalUser);
    playUiSound('unlock');
    setPendingLaunch(launchAfter);
  };

  // Confirm Pre-Game Camera & Mic Permission -> Enter Match
  const handleMediaCheckConfirmed = async (
    stream: MediaStream,
    cameraOn: boolean,
    micMuted: boolean
  ) => {
    const launch = pendingLaunch;
    setPendingLaunch(null);
    if (!launch) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    preApprovedMediaRef.current = { stream, cameraOn, micMuted };
    setSelectedTimeMs(launch.timeControlMs);

    if (launch.kind === 'random') {
      setViewMode('searching');
      return;
    }

    if (launch.kind === 'friend_link') {
      if (!currentUser) return;
      const newGameId = `chess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      setActiveGameId(newGameId);
      setPreferredColor('w');
      setMyColor('w');
      setBoardOrientation('w');
      setGameMode('online');
      setChessState(
        createInitialGameState(launch.timeControlMs, {
          id: currentUser.id,
          alias: currentUser.alias,
          username: currentUser.username,
          avatar: currentUser.avatar,
        })
      );
      setChatMessages([]);
      setViewMode('game');
      return;
    }

    if (launch.kind === 'direct_invite') {
      if (!currentUser) return;
      const invRes = await sendChessInvite(currentUser.id, launch.friend.id, launch.timeControlMs);
      if (!invRes.ok || !invRes.gameId) {
        stream.getTracks().forEach((t) => t.stop());
        preApprovedMediaRef.current = null;
        setMediaNotice(invRes.error || 'Could not send challenge notification.');
        return;
      }
      setActiveGameId(invRes.gameId);
      setPreferredColor('w');
      setMyColor('w');
      setBoardOrientation('w');
      setGameMode('online');
      setChessState(
        createInitialGameState(
          launch.timeControlMs,
          {
            id: currentUser.id,
            alias: currentUser.alias,
            username: currentUser.username,
            avatar: currentUser.avatar,
          },
          null
        )
      );
      setChatMessages([]);
      setMediaNotice(`Challenge notification sent to ${launch.friend.alias}! Waiting for them to accept...`);
      setViewMode('game');
      return;
    }

    if (launch.kind === 'join_game') {
      setActiveGameId(launch.gameId);
      setPreferredColor('b');
      setMyColor('b');
      setBoardOrientation('b');
      setGameMode('online');
      setChessState(createInitialGameState(launch.timeControlMs));
      setChatMessages([]);
      setViewMode('game');
      return;
    }

    if (launch.kind === 'bot') {
      const meInfo: ChessPlayerInfo = currentUser
        ? {
            id: currentUser.id,
            alias: currentUser.alias,
            username: currentUser.username,
            avatar: currentUser.avatar,
          }
        : {
            id: 'guest-chess',
            alias: quickName.trim() || 'GuestPlayer',
            avatar: { bg: 'from-lime-400 to-emerald-700', emoji: quickEmoji },
          };
      const taraBot: ChessPlayerInfo = {
        id: 'bot-tara',
        alias: 'Tara Bot (Club)',
        username: 'tara_bot',
        avatar: { bg: 'from-pink-500 to-rose-700', emoji: '🤖' },
      };

      recordedLocalBotIdRef.current = null;
      setActiveGameId(`bot_${Date.now()}`);
      setMyColor('w');
      setPreferredColor('w');
      setBoardOrientation('w');
      setGameMode('bot');
      setChessState(createInitialGameState(launch.timeControlMs, meInfo, taraBot));
      setChatMessages([
        {
          id: 'bot_intro',
          sender_id: 'bot-tara',
          sender_alias: 'Tara Bot',
          text: 'Camera & Mic ready! White moves first — good luck ♟️',
          created_at: new Date().toISOString(),
        },
      ]);
      setViewMode('game');
    }
  };

  const handleLeaveGame = () => {
    playUiSound('click');
    stopAllMediaAndSocket();
    setActiveGameId(null);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setViewMode('lobby');
    onClearInitialGame?.();
  };

  const toggleMic = async () => {
    playUiSound('pop');
    if (gameMode === 'bot') {
      const next = !isMicMuted;
      setIsMicMuted(next);
      isMutedRef.current = next;
      localAudioStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      return;
    }

    if (!localAudioStreamRef.current || localAudioStreamRef.current.getAudioTracks().length === 0) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000,
          },
          video: false,
        });
        localAudioStreamRef.current = mic;
        setIsMicMuted(false);
        isMutedRef.current = false;

        if (localMeterRef.current) localMeterRef.current();
        localMeterRef.current = createVolumeMeter(mic, (_lvl, speaking) => {
          const active = speaking && !isMutedRef.current;
          setIsLocalSpeaking(active);
          meshRef.current?.broadcastSpeaking(active);
        });

        meshRef.current?.updateLocalStream(mic);
        meshRef.current?.broadcastMuteState(false);
        return;
      } catch {
        setMediaNotice('Microphone permission blocked in browser.');
        setTimeout(() => setMediaNotice(''), 3000);
        return;
      }
    }

    const nextMuted = !isMicMuted;
    setIsMicMuted(nextMuted);
    isMutedRef.current = nextMuted;
    if (nextMuted) setIsLocalSpeaking(false);
    localAudioStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !nextMuted;
    });
    meshRef.current?.broadcastMuteState(nextMuted);
  };

  const toggleCamera = async () => {
    playUiSound('pop');
    if (isCameraOn) {
      // Turn camera OFF cleanly mid-game (audio stays live!)
      localVideoStream?.getVideoTracks().forEach((t) => t.stop());
      localAudioStreamRef.current?.getVideoTracks().forEach((t) => {
        t.stop();
        localAudioStreamRef.current?.removeTrack(t);
      });
      if (localCamStreamRef.current && localCamStreamRef.current !== localAudioStreamRef.current) {
        localCamStreamRef.current.getVideoTracks().forEach((t) => t.stop());
      }
      localCamStreamRef.current = null;
      setLocalVideoStream(null);
      setIsCameraOn(false);
      await meshRef.current?.setLocalVideoTrack(null);
      return;
    }

    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 }, facingMode: 'user' },
        audio: false,
      });
      const videoTrack = camStream.getVideoTracks()[0];
      if (!videoTrack) {
        camStream.getTracks().forEach((t) => t.stop());
        return;
      }
      localCamStreamRef.current = camStream;
      setLocalVideoStream(camStream);
      setIsCameraOn(true);
      await meshRef.current?.setLocalVideoTrack(videoTrack);
    } catch {
      setMediaNotice('Camera unavailable or permission blocked on this device.');
      setTimeout(() => setMediaNotice(''), 3500);
    }
  };

  const handleToggleSpeaker = () => {
    const next = !speakerMuted;
    setSpeakerMuted(next);
    meshRef.current?.setRemoteSpeakerMuted(next);
  };

  const handleVolumeChange = (val: number) => {
    setSpeakerVolume(val);
    setSpeakerMuted(val === 0);
    meshRef.current?.setRemoteSpeakerVolume(val);
    meshRef.current?.setRemoteSpeakerMuted(val === 0);
  };

  const handleCopyInvite = async () => {
    if (!activeGameId) return;
    playUiSound('pop');
    const url = `${window.location.origin}/?chess=${encodeURIComponent(activeGameId)}&tc=${selectedTimeMs}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setMediaNotice(url);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = chatInput.trim().slice(0, 240);
    if (!clean) return;
    playUiSound('click');

    if (gameMode === 'online' && meshRef.current) {
      const msg = meshRef.current.sendRoomChatMessage(clean);
      setChatMessages((prev) => [...prev, msg]);
    } else {
      const msg: RoomChatMessage = {
        id: `local_${Date.now()}`,
        sender_id: currentUser?.id || 'guest-chess',
        sender_alias: currentUser?.alias || 'You',
        text: clean,
        created_at: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, msg]);
    }
    setChatInput('');
  };

  const handleSendReaction = (emoji: string) => {
    playUiSound('pop');
    triggerReaction(emoji);
    meshRef.current?.sendReaction(emoji);
  };

  const handleResign = () => {
    playUiSound('kick');
    if (gameMode === 'online' && meshRef.current && wsConnected) {
      meshRef.current.sendCustomJson({ type: 'chess_resign' });
    } else {
      setChessState((prev) => ({
        ...prev,
        status: 'resigned',
        winner: myColor === 'w' ? 'b' : 'w',
      }));
    }
  };

  const handleOfferOrAcceptDraw = () => {
    playUiSound('click');
    const oppColor = myColor === 'w' ? 'b' : 'w';
    if (chessState.drawOfferBy === oppColor) {
      if (gameMode === 'online' && meshRef.current && wsConnected) {
        meshRef.current.sendCustomJson({ type: 'chess_draw_accept' });
      } else {
        setChessState((prev) => ({ ...prev, status: 'draw', winner: 'draw', drawOfferBy: null }));
      }
      return;
    }
    if (gameMode === 'online' && meshRef.current && wsConnected) {
      meshRef.current.sendCustomJson({ type: 'chess_draw_offer' });
    } else if (gameMode === 'bot') {
      setChessState((prev) => ({ ...prev, status: 'draw', winner: 'draw', drawOfferBy: null }));
    }
  };

  const handleRematch = () => {
    playUiSound('unlock');
    if (gameMode === 'online' && meshRef.current && wsConnected) {
      meshRef.current.sendCustomJson({ type: 'chess_rematch' });
    } else {
      const nextColor: 'w' | 'b' = myColor === 'w' ? 'b' : 'w';
      recordedLocalBotIdRef.current = null;
      setMyColor(nextColor);
      setBoardOrientation(nextColor);
      setChessState((prev) => createInitialGameState(prev.timeControlMs, prev.black, prev.white));
    }
  };

  const friendIds = useMemo(() => new Set(friendsData.friends.map((f) => f.id)), [friendsData.friends]);

  // -------------------- FIRST-SCREEN LOBBY VIEW --------------------
  if (viewMode === 'lobby') {
    const showcaseBoard = showcaseChess.board();

    return (
      <div className="space-y-6 animate-fadeIn">
        {/* Invited via ?chess= banner */}
        {initialGameId && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-[#CCFF00]/20 via-cyan-500/15 to-violet-500/20 border-2 border-[#CCFF00]">
            <div className="space-y-0.5">
              <p className="text-sm font-heading font-black text-white">
                🔗 Friend Invited You to a Live Chess + Video Match!
              </p>
              <p className="text-xs font-mono text-white/75">
                {currentUser
                  ? 'Click Join Match to verify Camera & Mic and enter!'
                  : 'Enter your Name & @username on the right to start with Camera & Mic!'}
              </p>
            </div>
            {currentUser && (
              <button
                type="button"
                onClick={() =>
                  setPendingLaunch({
                    kind: 'join_game',
                    gameId: initialGameId,
                    timeControlMs: initialTimeControlMs || 300000,
                  })
                }
                className="px-4 py-2 rounded-xl bg-[#CCFF00] text-black font-heading font-black text-xs shadow-neo"
              >
                🎥 Join Invite Match
              </button>
            )}
          </div>
        )}

        {/* Main First-Page ChessBoard + Onboarding/Social Split Stage */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: First-Page Interactive Chessboard + Play Modes */}
          <div className="lg:col-span-7 bg-[#111116] border-2 border-white/15 rounded-3xl p-4 sm:p-5 space-y-4 shadow-neo min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#CCFF00]/15 border border-[#CCFF00]/40 text-[#CCFF00] text-[10px] font-mono font-bold mb-1">
                  <Video className="w-3 h-3" />
                  <span>LIVE CHESS + CLEAR VOICE &amp; CAMERA CHAT</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-heading font-black text-white">
                  Play Chess Face-to-Face ♟️
                </h1>
              </div>

              {/* Time Control Selector */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {CHESS_TIME_OPTIONS.map((opt) => (
                  <button
                    key={opt.ms}
                    type="button"
                    onClick={() => {
                      playUiSound('click');
                      setSelectedTimeMs(opt.ms);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl font-mono text-xs font-bold border transition-all flex items-center gap-1 ${
                      selectedTimeMs === opt.ms
                        ? 'bg-[#CCFF00] text-black border-[#CCFF00]'
                        : 'bg-[#070709] text-white/75 border-white/15 hover:border-white/40'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Crisp Interactive Showcase Chessboard Visible Immediately on Load */}
            <div className="relative w-full max-w-[440px] mx-auto aspect-square rounded-2xl overflow-hidden border-2 border-cyan-400/50 shadow-neo select-none">
              <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
                {RANKS_WHITE.map((rank, rIdx) =>
                  FILES.map((file, fIdx) => {
                    const sq = `${file}${rank}` as Square;
                    const rankIndex = 8 - Number(rank);
                    const fileIndex = FILES.indexOf(file);
                    const piece = showcaseBoard[rankIndex]?.[fileIndex];
                    const isLight = (fileIndex + rankIndex) % 2 === 0;
                    const isSelected = showcaseSelected === sq;
                    const isLegalTarget = showcaseLegal.has(sq);
                    const isCaptureTarget = showcaseLegal.get(sq) === true;

                    let bgClass = isLight ? 'bg-[#D6D8E4]' : 'bg-[#635985]';
                    if (isSelected) bgClass = 'bg-[#CCFF00]';

                    return (
                      <button
                        key={sq}
                        type="button"
                        onClick={() => handleShowcaseSquareClick(sq)}
                        aria-label={`Board ${sq}`}
                        className={`relative flex items-center justify-center ${bgClass} transition-colors`}
                      >
                        {fIdx === 0 && (
                          <span
                            className={`absolute top-0.5 left-1 text-[9px] font-mono font-bold ${
                              isLight ? 'text-slate-700/70' : 'text-white/70'
                            }`}
                          >
                            {rank}
                          </span>
                        )}
                        {rIdx === 7 && (
                          <span
                            className={`absolute bottom-0.5 right-1 text-[9px] font-mono font-bold ${
                              isLight ? 'text-slate-700/70' : 'text-white/70'
                            }`}
                          >
                            {file}
                          </span>
                        )}
                        {piece && <PieceIcon type={piece.type} color={piece.color} />}
                        {isLegalTarget && !isCaptureTarget && (
                          <span className="w-3 h-3 rounded-full bg-black/35 pointer-events-none" />
                        )}
                        {isLegalTarget && isCaptureTarget && (
                          <span className="absolute inset-1 rounded-full border-4 border-rose-500/80 pointer-events-none" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/75 border border-white/15 text-[10px] font-mono text-white/80 pointer-events-none">
                Interactive Board • Tap to Try
              </div>
            </div>

            {/* 3 Launch Modes below board */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                disabled={isCreatingProfile}
                onClick={() =>
                  void ensureProfileAndLaunch(
                    initialGameId
                      ? { kind: 'join_game', gameId: initialGameId, timeControlMs: selectedTimeMs }
                      : { kind: 'random', timeControlMs: selectedTimeMs }
                  )
                }
                className="p-3.5 rounded-2xl bg-gradient-to-br from-[#CCFF00] to-emerald-400 text-black font-heading font-black text-left border-2 border-black hover:scale-[1.02] transition-all shadow-neo space-y-0.5"
              >
                <div className="flex items-center justify-between text-sm">
                  <span>{initialGameId ? '🎥 Join Invite' : '🎥 Random Match'}</span>
                  <Swords className="w-4 h-4" />
                </div>
                <p className="text-[11px] font-body font-medium text-black/80">
                  Camera check + live human queue
                </p>
              </button>

              <button
                type="button"
                disabled={isCreatingProfile}
                onClick={() =>
                  void ensureProfileAndLaunch({ kind: 'friend_link', timeControlMs: selectedTimeMs })
                }
                className="p-3.5 rounded-2xl bg-[#181822] hover:bg-[#1f1f2d] text-white font-heading font-bold text-left border border-cyan-400/50 hover:border-cyan-400 transition-all space-y-0.5"
              >
                <div className="flex items-center justify-between text-sm text-cyan-300">
                  <span>🔗 Friend Link</span>
                  <Link2 className="w-4 h-4" />
                </div>
                <p className="text-[11px] font-body text-white/65">
                  Copy board link for any friend
                </p>
              </button>

              <button
                type="button"
                disabled={isCreatingProfile}
                onClick={() =>
                  void ensureProfileAndLaunch({ kind: 'bot', timeControlMs: selectedTimeMs })
                }
                className="p-3.5 rounded-2xl bg-[#181822] hover:bg-[#1f1f2d] text-white font-heading font-bold text-left border border-white/15 hover:border-violet-400 transition-all space-y-0.5"
              >
                <div className="flex items-center justify-between text-sm text-violet-300">
                  <span>🤖 Practice Bot</span>
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <p className="text-[11px] font-body text-white/65">
                  Warm up solo + test camera/mic
                </p>
              </button>
            </div>
          </div>

          {/* Right Column: Instant Name & @username Form OR Live Friends & Game History */}
          <div className="lg:col-span-5 space-y-4 min-w-0">
            {!currentUser ? (
              <div className="bg-[#111116] border-2 border-[#CCFF00] rounded-3xl p-5 sm:p-6 space-y-4 shadow-neo">
                <div className="space-y-1">
                  <span className="text-[11px] font-mono font-bold text-[#CCFF00] uppercase">
                    ⚡ 5-Second Player Profile • No Password
                  </span>
                  <h2 className="text-xl font-heading font-black text-white">
                    Apna Name &amp; Username Banayein
                  </h2>
                  <p className="text-xs text-white/65">
                    Create your unique <span className="text-cyan-300">@username</span> so friends see your Online Blue Tick &amp; send challenges.
                  </p>
                </div>

                {/* Avatar Quick Picker */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {QUICK_EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => {
                        playUiSound('pop');
                        setQuickEmoji(em);
                      }}
                      className={`w-9 h-9 rounded-xl border text-lg flex items-center justify-center transition-all ${
                        quickEmoji === em
                          ? 'bg-[#CCFF00]/20 border-[#CCFF00] scale-105'
                          : 'bg-[#070709] border-white/15'
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-mono text-white/70 block mb-1">
                      YOUR NAME (DISPLAY NAME)
                    </label>
                    <input
                      type="text"
                      value={quickName}
                      maxLength={24}
                      onChange={(e) => {
                        const nextName = e.target.value;
                        setQuickName(nextName);
                        setSignupError('');
                        if (!usernameEdited && nextName.trim()) {
                          setQuickUsername(suggestUsernameFromName(nextName));
                        }
                      }}
                      placeholder="e.g. Alok"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#070709] border border-white/20 focus:border-[#CCFF00] text-sm text-white font-heading font-bold outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-mono text-white/70">
                        UNIQUE @USERNAME
                      </label>
                      {quickUsername.length >= 3 && (
                        <span
                          className={`text-[10px] font-mono font-bold ${
                            usernameStatus === 'available'
                              ? 'text-[#CCFF00]'
                              : usernameStatus === 'taken'
                              ? 'text-rose-400'
                              : 'text-white/50'
                          }`}
                        >
                          {usernameStatus === 'checking'
                            ? 'Checking...'
                            : usernameStatus === 'available'
                            ? `✓ @${normalizeUsernameInput(quickUsername)} available`
                            : usernameStatus === 'taken'
                            ? 'Already taken'
                            : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center px-3.5 py-2.5 rounded-xl bg-[#070709] border border-white/20 focus-within:border-cyan-400">
                      <span className="font-mono text-sm text-cyan-300 mr-1">@</span>
                      <input
                        type="text"
                        value={quickUsername}
                        maxLength={20}
                        onChange={(e) => {
                          setUsernameEdited(true);
                          setQuickUsername(normalizeUsernameInput(e.target.value));
                          setSignupError('');
                        }}
                        placeholder="alok_chess"
                        className="flex-1 min-w-0 bg-transparent text-sm text-white font-mono outline-none"
                      />
                    </div>
                  </div>
                </div>

                {signupError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono">
                    ⚠️ {signupError}
                  </div>
                )}

                <button
                  type="button"
                  disabled={isCreatingProfile}
                  onClick={() =>
                    void ensureProfileAndLaunch(
                      initialGameId
                        ? { kind: 'join_game', gameId: initialGameId, timeControlMs: selectedTimeMs }
                        : { kind: 'random', timeControlMs: selectedTimeMs }
                    )
                  }
                  className="w-full py-3 rounded-2xl bg-[#CCFF00] hover:bg-lime-300 disabled:opacity-50 text-black font-heading font-black text-sm flex items-center justify-center gap-2 shadow-neo border-2 border-black"
                >
                  <Video className="w-4 h-4" />
                  <span>
                    {isCreatingProfile
                      ? 'Saving Profile...'
                      : initialGameId
                      ? 'Save & Enter Invite Match'
                      : 'Save & Play Live Chess + Cam'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onOpenRestore}
                  className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white/70 flex items-center justify-center gap-1.5"
                >
                  <Key className="w-3.5 h-3.5 text-violet-400" />
                  <span>Already have a Scene Key? Restore Account</span>
                </button>
              </div>
            ) : (
              <div className="bg-[#111116] border border-[#1D9BF0]/40 rounded-3xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${currentUser.avatar.bg} flex items-center justify-center text-xl border border-white/20 flex-shrink-0`}
                  >
                    {currentUser.avatar.emoji}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-heading font-black text-base text-white truncate">
                        {currentUser.alias}
                      </span>
                      <OnlineBlueTick isOnline={true} showLabel />
                    </div>
                    <p className="text-xs font-mono text-cyan-300 truncate">
                      @{currentUser.username || currentUser.alias.toLowerCase()} •{' '}
                      <span className="text-white/60">
                        {currentUser.wins || 0}W / {currentUser.draws || 0}D / {currentUser.losses || 0}L
                      </span>
                    </p>
                  </div>
                </div>
                {onSignOut && (
                  <button
                    type="button"
                    onClick={() => {
                      playUiSound('click');
                      onSignOut();
                    }}
                    title="Switch User / Sign Out"
                    className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-rose-500/15 border border-white/15 hover:border-rose-400/40 text-[11px] font-mono text-white/75 hover:text-rose-200 flex items-center gap-1 flex-shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Switch</span>
                  </button>
                )}
              </div>
            )}

            {/* Persistent Friends List + Game History Dock */}
            <FriendsAndHistoryPanel
              currentUser={currentUser}
              friendsData={friendsData}
              history={history}
              onlineUserIds={onlineUserIds}
              onSendFriendRequest={onSendFriendRequest}
              onRespondRequest={onRespondFriendRequest}
              onRemoveFriend={onRemoveFriend}
              onChallengePlayer={(player) => {
                playUiSound('pop');
                if (!currentUser) {
                  setSignupError('Create your Name & @username first to send challenges!');
                  return;
                }
                setPendingLaunch({
                  kind: 'direct_invite',
                  friend: player,
                  timeControlMs: selectedTimeMs,
                });
              }}
              onOpenChat={onOpenChat}
              onRequireProfile={() => setSignupError('Enter Name & @username above to add friends!')}
            />
          </div>
        </div>

        {/* Pre-Game Camera & Mic Permission Check Modal */}
        <PreGameMediaModal
          isOpen={Boolean(pendingLaunch)}
          matchTitle={
            pendingLaunch?.kind === 'bot'
              ? 'Practice Match vs Tara Bot'
              : pendingLaunch?.kind === 'direct_invite'
              ? `Challenging ${pendingLaunch.friend.alias}`
              : pendingLaunch?.kind === 'friend_link'
              ? 'Create Private Friend Board'
              : 'Live Chess + Video Match'
          }
          onCancel={() => {
            setPendingLaunch(null);
            onClearInitialGame?.();
          }}
          onEnterMatch={(stream, camOn, micMuted) =>
            void handleMediaCheckConfirmed(stream, camOn, micMuted)
          }
        />
      </div>
    );
  }

  // -------------------- SEARCHING QUEUE VIEW --------------------
  if (viewMode === 'searching') {
    return (
      <div className="bg-[#111116] border-2 border-cyan-400 rounded-3xl p-8 sm:p-12 text-center space-y-5 shadow-neo animate-fadeIn">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/15 border border-cyan-400/50 flex items-center justify-center mx-auto">
          <Loader2 className="w-8 h-8 text-cyan-300 animate-spin" />
        </div>
        <div className="space-y-2 max-w-md mx-auto">
          <h3 className="text-2xl font-heading font-black text-white">
            Finding Live Opponent...
          </h3>
          <p className="text-xs sm:text-sm font-mono text-white/60">
            Waiting in Cloudflare Durable Objects matchmaking queue ({formatChessClock(selectedTimeMs)}). Challenge a friend or open a second tab to match instantly!
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() =>
              setPendingLaunch({ kind: 'friend_link', timeControlMs: selectedTimeMs })
            }
            className="px-5 py-2.5 rounded-xl bg-cyan-500/15 border border-cyan-400/50 text-cyan-300 text-xs font-mono font-bold"
          >
            🔗 Create Friend Link Instead
          </button>
          <button
            type="button"
            onClick={() => {
              lobbySocket.leaveChessQueue();
              stopAllMediaAndSocket();
              setViewMode('lobby');
            }}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white/70 text-xs font-mono hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // -------------------- ACTIVE CHESS + VIDEO GAME --------------------
  const oppColor: 'w' | 'b' = myColor === 'w' ? 'b' : 'w';
  const myPlayer = myColor === 'w' ? chessState.white : chessState.black;
  const oppPlayer = oppColor === 'w' ? chessState.white : chessState.black;

  const liveWhiteMs =
    chessState.status === 'active' && chessState.moveCount > 0 && chessState.turn === 'w' && chessState.lastMoveAt
      ? Math.max(0, chessState.whiteTimeMs - Math.max(0, clockNow - chessState.lastMoveAt))
      : chessState.whiteTimeMs;
  const liveBlackMs =
    chessState.status === 'active' && chessState.moveCount > 0 && chessState.turn === 'b' && chessState.lastMoveAt
      ? Math.max(0, chessState.blackTimeMs - Math.max(0, clockNow - chessState.lastMoveAt))
      : chessState.blackTimeMs;

  const myClockMs = myColor === 'w' ? liveWhiteMs : liveBlackMs;
  const oppClockMs = oppColor === 'w' ? liveWhiteMs : liveBlackMs;

  const displayRanks = boardOrientation === 'w' ? RANKS_WHITE : RANKS_BLACK;
  const displayFiles = boardOrientation === 'w' ? FILES : FILES_BLACK;
  const parsedMoves = chessInstance.history();
  const isMyTurn = chessState.turn === myColor;
  const isCheck = chessInstance.inCheck();
  const board = chessInstance.board();

  const oppIsOnline = oppPlayer?.id ? onlineUserIds.includes(oppPlayer.id) : false;
  const canAddOppFriend = Boolean(
    currentUser &&
      oppPlayer?.id &&
      oppPlayer.id !== currentUser.id &&
      !oppPlayer.id.startsWith('bot-') &&
      !oppPlayer.id.startsWith('guest-') &&
      !friendIds.has(oppPlayer.id) &&
      !friendReqSentIds[oppPlayer.id]
  );

  const handleAddOpponentAsFriend = async () => {
    if (!oppPlayer?.id) return;
    playUiSound('pop');
    setFriendReqSentIds((prev) => ({ ...prev, [oppPlayer.id]: true }));
    const msg = await onSendFriendRequest({ toUserId: oppPlayer.id });
    setMediaNotice(msg);
    setTimeout(() => setMediaNotice(''), 3000);
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#111116] border border-white/15 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-xs font-mono font-bold">
            ♟️ {gameMode === 'bot' ? 'VS TARA BOT' : wsConnected ? 'LIVE D1/DO SYNC' : 'CONNECTING SYNC...'}
          </span>
          {chessState.status === 'waiting' && (
            <span className="text-xs font-mono text-amber-300 truncate">
              Waiting for opponent...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              playUiSound('click');
              setBoardOrientation((o) => (o === 'w' ? 'b' : 'w'));
            }}
            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-mono text-white/80 flex items-center gap-1"
            title="Flip board"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Flip</span>
          </button>

          {gameMode === 'online' && activeGameId && (
            <button
              type="button"
              onClick={handleCopyInvite}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-mono text-white flex items-center gap-1.5"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-[#CCFF00]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied!' : 'Invite Link'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleLeaveGame}
            className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-mono text-rose-300 flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>Leave</span>
          </button>
        </div>
      </div>

      {mediaNotice && (
        <div className="px-4 py-2.5 rounded-xl bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 text-xs font-mono">
          {mediaNotice}
        </div>
      )}

      {chessState.drawOfferBy === oppColor && chessState.status === 'active' && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-violet-500/20 border border-violet-400 text-xs font-mono">
          <span className="text-white font-bold">🤝 Opponent offered a Draw!</span>
          <button
            type="button"
            onClick={handleOfferOrAcceptDraw}
            className="px-3 py-1.5 rounded-xl bg-[#CCFF00] text-black font-bold"
          >
            Accept Draw
          </button>
        </div>
      )}

      {chessState.status !== 'active' && chessState.status !== 'waiting' && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 rounded-2xl bg-gradient-to-r from-violet-600/30 via-[#111116] to-cyan-600/30 border-2 border-[#CCFF00]">
          <div>
            <h3 className="text-base sm:text-lg font-heading font-black text-white">
              {chessState.winner === 'draw'
                ? '🤝 Game Drawn!'
                : chessState.winner === myColor
                ? '👑 Victory! You Won!'
                : '💀 Match Over — Opponent Won'}
            </h3>
            <p className="text-xs font-mono text-white/70 uppercase">
              Result: {chessState.status} • Saved to Game History
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canAddOppFriend && (
              <button
                type="button"
                onClick={() => void handleAddOpponentAsFriend()}
                className="px-3.5 py-2 rounded-xl bg-[#1D9BF0] text-white font-heading font-bold text-xs flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Friend</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleRematch}
              className="px-4 py-2 rounded-xl bg-[#CCFF00] text-black font-heading font-black text-xs flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Rematch Now</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Board Column */}
        <div className="lg:col-span-7 space-y-3 min-w-0">
          {/* Opponent Player Strip with Blue Online Tick + Add Friend */}
          <div className="flex items-center justify-between gap-2 bg-[#111116] border border-white/10 rounded-2xl px-3.5 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl bg-gradient-to-br ${
                  oppPlayer?.avatar?.bg || 'from-slate-600 to-slate-800'
                } flex items-center justify-center text-base border border-white/20 flex-shrink-0 ${
                  isRemoteSpeaking ? 'ring-2 ring-[#CCFF00]' : ''
                }`}
              >
                {oppPlayer?.avatar?.emoji || '👤'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-heading font-bold text-sm text-white truncate">
                    {oppPlayer?.alias || 'Waiting Opponent'}
                  </span>
                  {oppPlayer?.id && !oppPlayer.id.startsWith('bot-') && (
                    <OnlineBlueTick isOnline={oppIsOnline} size="xs" />
                  )}
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                    {oppColor === 'w' ? 'White' : 'Black'}
                  </span>
                  {canAddOppFriend && (
                    <button
                      type="button"
                      onClick={() => void handleAddOpponentAsFriend()}
                      className="px-2 py-0.5 rounded-md bg-[#1D9BF0]/20 hover:bg-[#1D9BF0]/30 border border-[#1D9BF0]/40 text-[#38BDF8] text-[10px] font-mono flex items-center gap-1"
                    >
                      <UserPlus className="w-2.5 h-2.5" />
                      <span>Add</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-white/50">
                  {oppPlayer?.username && (
                    <span className="text-cyan-300">@{oppPlayer.username}</span>
                  )}
                  <span>
                    {(oppColor === 'w' ? material.capturedByWhite : material.capturedByBlack).length > 0
                      ? (oppColor === 'w' ? material.capturedByWhite : material.capturedByBlack)
                          .map((p) => p.toUpperCase())
                          .join(' ')
                      : 'No captures'}
                  </span>
                </div>
              </div>
            </div>

            <div
              className={`px-3 py-1.5 rounded-xl font-mono text-sm font-black border flex-shrink-0 ${
                chessState.status === 'active' && chessState.turn === oppColor
                  ? 'bg-[#CCFF00] text-black border-[#CCFF00]'
                  : 'bg-[#070709] text-white/80 border-white/15'
              }`}
            >
              {formatChessClock(oppClockMs)}
            </div>
          </div>

          {/* 8x8 Interactive Board */}
          <div className="relative w-full max-w-[480px] mx-auto aspect-square rounded-2xl overflow-hidden border-2 border-white/20 shadow-neo select-none">
            <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
              {displayRanks.map((rank, rIdx) =>
                displayFiles.map((file, fIdx) => {
                  const sq = `${file}${rank}` as Square;
                  const rankIndex = 8 - Number(rank);
                  const fileIndex = FILES.indexOf(file);
                  const piece = board[rankIndex]?.[fileIndex];
                  const isLight = (fileIndex + rankIndex) % 2 === 0;
                  const isSelected = selectedSquare === sq;
                  const isLegalTarget = legalDestinations.has(sq);
                  const isCaptureTarget = legalDestinations.get(sq) === true;
                  const isLastMove =
                    chessState.lastMove?.from === sq || chessState.lastMove?.to === sq;
                  const isKingInCheck =
                    isCheck && piece?.type === 'k' && piece.color === chessState.turn;

                  let bgClass = isLight ? 'bg-[#D6D8E4]' : 'bg-[#635985]';
                  if (isLastMove) bgClass = isLight ? 'bg-[#D8F36A]' : 'bg-[#8BA83B]';
                  if (isSelected) bgClass = 'bg-[#CCFF00]';
                  if (isKingInCheck) bgClass = 'bg-rose-500';

                  return (
                    <button
                      key={sq}
                      type="button"
                      onClick={() => handleSquareClick(sq)}
                      aria-label={`Square ${sq}`}
                      className={`relative flex items-center justify-center ${bgClass} transition-colors focus:outline-none`}
                    >
                      {fIdx === 0 && (
                        <span
                          className={`absolute top-0.5 left-1 text-[9px] font-mono font-bold ${
                            isLight ? 'text-slate-700/70' : 'text-white/70'
                          }`}
                        >
                          {rank}
                        </span>
                      )}
                      {rIdx === 7 && (
                        <span
                          className={`absolute bottom-0.5 right-1 text-[9px] font-mono font-bold ${
                            isLight ? 'text-slate-700/70' : 'text-white/70'
                          }`}
                        >
                          {file}
                        </span>
                      )}
                      {piece && <PieceIcon type={piece.type} color={piece.color} />}
                      {isLegalTarget && !isCaptureTarget && (
                        <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-black/35 pointer-events-none" />
                      )}
                      {isLegalTarget && isCaptureTarget && (
                        <span className="absolute inset-1 rounded-full border-4 border-rose-500/80 pointer-events-none" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {pendingPromotion && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20 p-4">
                <p className="text-xs font-mono font-bold text-[#CCFF00] uppercase">
                  Choose Promotion Piece
                </p>
                <div className="flex items-center gap-2">
                  {(['q', 'r', 'b', 'n'] as const).map((promo) => (
                    <button
                      key={promo}
                      type="button"
                      onClick={() =>
                        executePlayerMove(pendingPromotion.from, pendingPromotion.to, promo)
                      }
                      className="p-3 rounded-2xl bg-[#111116] border-2 border-[#CCFF00] hover:scale-105 transition-transform"
                    >
                      <PieceIcon type={promo} color={myColor} />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPendingPromotion(null)}
                  className="text-xs font-mono text-white/60 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Your Player Strip */}
          <div className="flex items-center justify-between gap-2 bg-[#111116] border border-white/15 rounded-2xl px-3.5 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl bg-gradient-to-br ${
                  myPlayer?.avatar?.bg || currentUser?.avatar?.bg || 'from-lime-500 to-emerald-700'
                } flex items-center justify-center text-base border border-white/20 flex-shrink-0 ${
                  isLocalSpeaking ? 'ring-2 ring-[#CCFF00]' : ''
                }`}
              >
                {myPlayer?.avatar?.emoji || currentUser?.avatar?.emoji || '⚡'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-heading font-bold text-sm text-white truncate">
                    {myPlayer?.alias || currentUser?.alias || 'You'}
                  </span>
                  <OnlineBlueTick isOnline={true} size="xs" />
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#CCFF00]/15 text-[#CCFF00]">
                    {myColor === 'w' ? 'White' : 'Black'}
                  </span>
                  {isMyTurn && chessState.status === 'active' && (
                    <span className="text-[10px] font-mono text-[#CCFF00]">• Your Turn</span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-white/50">
                  {currentUser?.username && (
                    <span className="text-cyan-300 mr-2">@{currentUser.username}</span>
                  )}
                  {material.advantageWhite !== 0
                    ? `Material: ${
                        (myColor === 'w' ? material.advantageWhite : -material.advantageWhite) > 0
                          ? '+'
                          : ''
                      }${myColor === 'w' ? material.advantageWhite : -material.advantageWhite}`
                    : 'Even'}
                </div>
              </div>
            </div>

            <div
              className={`px-3 py-1.5 rounded-xl font-mono text-sm font-black border flex-shrink-0 ${
                chessState.status === 'active' && isMyTurn
                  ? 'bg-[#CCFF00] text-black border-[#CCFF00]'
                  : 'bg-[#070709] text-white/80 border-white/15'
              }`}
            >
              {formatChessClock(myClockMs)}
            </div>
          </div>

          {/* Match Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={chessState.status !== 'active'}
                onClick={handleOfferOrAcceptDraw}
                className="px-3.5 py-2 rounded-xl bg-[#111116] hover:bg-white/5 disabled:opacity-40 border border-white/15 text-xs font-mono text-white/80 flex items-center gap-1.5"
              >
                <Handshake className="w-3.5 h-3.5 text-cyan-300" />
                <span>{chessState.drawOfferBy === myColor ? 'Draw Offered' : 'Draw'}</span>
              </button>
              <button
                type="button"
                disabled={chessState.status !== 'active'}
                onClick={handleResign}
                className="px-3.5 py-2 rounded-xl bg-[#111116] hover:bg-rose-500/15 disabled:opacity-40 border border-white/15 text-xs font-mono text-rose-300 flex items-center gap-1.5"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Resign</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {['🔥', '💀', '👏', '👑'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleSendReaction(emoji)}
                  className="px-2.5 py-1.5 rounded-xl bg-[#111116] hover:bg-white/10 border border-white/10 text-sm transition-transform hover:scale-110"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Video Chat & Clear Audio + Board Chat / Move History */}
        <div className="lg:col-span-5 space-y-4 min-w-0">
          <div className="relative bg-[#111116] border border-cyan-400/30 rounded-3xl p-4 space-y-3 overflow-hidden">
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
              {floatingEmojis.map((item) => (
                <span
                  key={item.id}
                  style={{ left: `${item.x}%` }}
                  className="absolute bottom-6 text-2xl animate-bounce"
                >
                  {item.emoji}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-cyan-300 flex-shrink-0" />
                <span className="font-heading font-bold text-sm text-white truncate">
                  Clear Voice &amp; Camera
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#CCFF00]/15 text-[#CCFF00] flex-shrink-0">
                {gameMode === 'bot'
                  ? 'Bot Mode'
                  : remoteConnected
                  ? '🟢 HD Opus Live'
                  : '⏳ Waiting Peer'}
              </span>
            </div>

            {/* Dual Video / Avatar Stage */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Partner Tile */}
              <div
                className={`relative aspect-video rounded-2xl bg-[#070709] border overflow-hidden flex items-center justify-center ${
                  isRemoteSpeaking ? 'border-[#CCFF00]' : 'border-white/10'
                }`}
              >
                <video
                  ref={remoteVideoElRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${isRemoteCameraOn ? 'block' : 'hidden'}`}
                />
                {!isRemoteCameraOn && (
                  <div className="flex flex-col items-center gap-1 p-2 text-center">
                    <div
                      className={`w-11 h-11 rounded-full bg-gradient-to-br ${
                        oppPlayer?.avatar?.bg || 'from-violet-600 to-indigo-900'
                      } flex items-center justify-center text-xl`}
                    >
                      {oppPlayer?.avatar?.emoji || '♟️'}
                    </div>
                    <span className="text-[11px] font-mono text-white/75 truncate max-w-full">
                      {oppPlayer?.alias || 'Opponent'}
                    </span>
                  </div>
                )}
                <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[9px] font-mono text-white/80">
                  {isRemoteMuted ? '🔇 Muted' : '🎙️ Live'}
                </span>
              </div>

              {/* Self Tile */}
              <div
                className={`relative aspect-video rounded-2xl bg-[#070709] border overflow-hidden flex items-center justify-center ${
                  isLocalSpeaking ? 'border-[#CCFF00]' : 'border-white/10'
                }`}
              >
                <video
                  ref={localVideoElRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover scale-x-[-1] ${isCameraOn ? 'block' : 'hidden'}`}
                />
                {!isCameraOn && (
                  <div className="flex flex-col items-center gap-1 p-2 text-center">
                    <div
                      className={`w-11 h-11 rounded-full bg-gradient-to-br ${
                        myPlayer?.avatar?.bg || currentUser?.avatar?.bg || 'from-lime-500 to-emerald-700'
                      } flex items-center justify-center text-xl`}
                    >
                      {myPlayer?.avatar?.emoji || currentUser?.avatar?.emoji || '⚡'}
                    </div>
                    <span className="text-[11px] font-mono text-white/75 truncate max-w-full">
                      You (Cam Off)
                    </span>
                  </div>
                )}
                <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[9px] font-mono text-white/80">
                  {isMicMuted ? '🔇 Mic Off' : '🎙️ Clear Mic'}
                </span>
              </div>
            </div>

            {/* Mic, Camera & Speaker Clarity Controls */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={toggleMic}
                className={`py-2.5 px-3 rounded-xl font-heading font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                  isMicMuted
                    ? 'bg-[#070709] text-white/80 border-white/15 hover:border-white/35'
                    : 'bg-[#CCFF00] text-black border-[#CCFF00]'
                }`}
              >
                {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>{isMicMuted ? 'Mic On' : 'Mute Mic'}</span>
              </button>

              <button
                type="button"
                onClick={toggleCamera}
                className={`py-2.5 px-3 rounded-xl font-heading font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                  isCameraOn
                    ? 'bg-cyan-400 text-black border-cyan-400'
                    : 'bg-[#070709] text-white/80 border-white/15 hover:border-cyan-400/50'
                }`}
              >
                {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                <span>{isCameraOn ? 'Turn Cam Off' : 'Turn Cam On'}</span>
              </button>
            </div>

            {/* Opponent Audio Clarity / Volume Slider */}
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#070709] border border-white/10">
              <button
                type="button"
                onClick={handleToggleSpeaker}
                aria-label="Toggle opponent speaker audio"
                className="text-white/80 hover:text-[#CCFF00]"
              >
                {speakerMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-[#CCFF00]" />}
              </button>
              <span className="text-[10px] font-mono text-white/60 whitespace-nowrap">
                Voice Vol
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={speakerMuted ? 0 : speakerVolume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="flex-1 accent-[#CCFF00] h-1.5 cursor-pointer"
              />
              <span className="text-[10px] font-mono text-cyan-300 whitespace-nowrap">
                AEC ON
              </span>
            </div>
          </div>

          {/* Board Chat / Move History Card */}
          <div className="bg-[#111116] border border-white/15 rounded-3xl overflow-hidden flex flex-col h-[270px]">
            <div className="flex border-b border-white/10">
              <button
                type="button"
                onClick={() => setRightTab('chat')}
                className={`flex-1 py-2.5 text-xs font-mono font-bold flex items-center justify-center gap-1.5 border-b-2 ${
                  rightTab === 'chat'
                    ? 'border-[#CCFF00] text-[#CCFF00]'
                    : 'border-transparent text-white/50'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Board Chat ({chatMessages.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setRightTab('moves')}
                className={`flex-1 py-2.5 text-xs font-mono font-bold flex items-center justify-center gap-1.5 border-b-2 ${
                  rightTab === 'moves'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-white/50'
                }`}
              >
                <span>Move History ({parsedMoves.length})</span>
              </button>
            </div>

            {rightTab === 'chat' ? (
              <>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
                  {chatMessages.length === 0 ? (
                    <p className="text-center text-white/40 font-mono py-8">
                      Drop a glhf or chat live during moves...
                    </p>
                  ) : (
                    chatMessages.map((m) => (
                      <div key={m.id} className="leading-relaxed">
                        <span className="font-mono font-bold text-[#CCFF00] mr-1.5">
                          {m.sender_alias}:
                        </span>
                        <span className="text-white/85 break-words">{m.text}</span>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={handleSendChat} className="p-2.5 border-t border-white/10 flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Message opponent..."
                    className="flex-1 min-w-0 bg-[#070709] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:border-[#CCFF00] outline-none"
                  />
                  <button
                    type="submit"
                    aria-label="Send chess chat"
                    className="p-2 rounded-xl bg-[#CCFF00] text-black font-bold flex-shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto p-3">
                {parsedMoves.length === 0 ? (
                  <p className="text-center text-white/40 font-mono text-xs py-8">
                    No moves played yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
                    {Array.from({ length: Math.ceil(parsedMoves.length / 2) }).map((_, i) => (
                      <React.Fragment key={i}>
                        <div className="px-2.5 py-1 rounded bg-[#070709] text-white/90">
                          <span className="text-white/40 mr-2">{i + 1}.</span>
                          {parsedMoves[i * 2]}
                        </div>
                        <div className="px-2.5 py-1 rounded bg-[#070709] text-cyan-200">
                          {parsedMoves[i * 2 + 1] || ''}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
