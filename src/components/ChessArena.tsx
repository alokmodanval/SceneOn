import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, PieceSymbol, Square } from 'chess.js';
import confetti from 'canvas-confetti';
import {
  Check,
  Clock,
  Copy,
  Crown,
  Flag,
  Handshake,
  Link2,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Swords,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import {
  ChessGameState,
  ChessPlayerInfo,
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
} from '../lib/chessHelpers';
import {
  createSilentAudioStream,
  createVolumeMeter,
  playUiSound,
} from '../lib/audioEngine';
import { lobbySocket } from '../lib/lobbySocket';
import { WebRTCMeshRoom } from '../lib/webrtcMesh';

interface ChessArenaProps {
  currentUser: SceneUser | null;
  initialGameId?: string | null;
  initialTimeControlMs?: number;
  onOpenOnboarding: () => void;
  onClearInitialGame?: () => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS_WHITE = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;
const RANKS_BLACK = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
const FILES_BLACK = ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] as const;

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
  initialGameId,
  initialTimeControlMs,
  onOpenOnboarding,
  onClearInitialGame,
}) => {
  const [viewMode, setViewMode] = useState<'lobby' | 'searching' | 'game'>(() =>
    initialGameId && currentUser ? 'game' : 'lobby'
  );
  const [gameMode, setGameMode] = useState<'online' | 'bot'>('online');
  const [selectedTimeMs, setSelectedTimeMs] = useState<number>(initialTimeControlMs || 300000);
  const [activeGameId, setActiveGameId] = useState<string | null>(initialGameId || null);
  const [myColor, setMyColor] = useState<'w' | 'b'>(() => (initialGameId ? 'b' : 'w'));
  const [preferredColor, setPreferredColor] = useState<'w' | 'b'>(() =>
    initialGameId ? 'b' : 'w'
  );

  const [chessState, setChessState] = useState<ChessGameState>(() =>
    createInitialGameState(initialTimeControlMs || 300000)
  );
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Real-time ticking clocks rendered smoothly
  const [clockNow, setClockNow] = useState<number>(() => Date.now());

  // WebRTC Voice & Video State (Privacy first: Camera OFF by default)
  const [wsConnected, setWsConnected] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(false);
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
  const localMeterRef = useRef<(() => void) | null>(null);
  const remoteMeterRef = useRef<(() => void) | null>(null);
  const localVideoElRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoElRef = useRef<HTMLVideoElement | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMutedRef = useRef(isMicMuted);
  const viewModeRef = useRef(viewMode);
  const myColorRef = useRef(myColor);

  useEffect(() => {
    isMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    myColorRef.current = myColor;
  }, [myColor]);

  // Bind streams cleanly to video elements
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
    if (meshRef.current) {
      meshRef.current.leave();
      meshRef.current = null;
    }
    setLocalVideoStream(null);
    setRemoteMediaStream(null);
    setIsCameraOn(false);
    setIsRemoteCameraOn(false);
    setIsMicMuted(true);
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

  // Connect WebRTC + Durable Object /ws/chess/:gameId when an online match opens
  useEffect(() => {
    if (viewMode !== 'game' || gameMode !== 'online' || !activeGameId || !currentUser) {
      return;
    }

    let cancelled = false;

    const bootOnlineMatch = async () => {
      let baseStream: MediaStream;
      try {
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        if (cancelled) {
          mic.getTracks().forEach((t) => t.stop());
          return;
        }
        // Start muted for privacy, user taps Mic On when ready
        mic.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
        localAudioStreamRef.current = mic;
        baseStream = mic;
        setIsMicMuted(true);
        isMutedRef.current = true;

        localMeterRef.current = createVolumeMeter(mic, (_lvl, speaking) => {
          const active = speaking && !isMutedRef.current;
          setIsLocalSpeaking(active);
          meshRef.current?.broadcastSpeaking(active);
        });
      } catch {
        baseStream = createSilentAudioStream();
        setIsMicMuted(true);
        isMutedRef.current = true;
      }

      if (cancelled) return;

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
            remoteMeterRef.current = createVolumeMeter(remoteStream, (_lvl, speaking) => {
              setIsRemoteSpeaking(speaking);
            });
          },
          onPeerJoin: (p) => {
            if (cancelled) return;
            setRemoteConnected(true);
            setIsRemoteMuted(p.is_muted ?? true);
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
              } else if (incoming.black?.id === currentUser.id) {
                setMyColor('b');
              }
            }
          },
        },
        currentUser.avatar,
        true,
        {
          wsPath: `/ws/chess/${encodeURIComponent(activeGameId)}`,
          enableVideoSlot: true,
          initialCameraOn: false,
        }
      );

      meshRef.current = mesh;
      mesh.sendCustomJson({
        type: 'chess_join',
        user: {
          id: currentUser.id,
          alias: currentUser.alias,
          avatar: currentUser.avatar,
        },
        preferredColor: preferredColor,
        timeControlMs: selectedTimeMs,
      });

      await mesh.start(baseStream, 'speaker', 1);

      if (cancelled) {
        mesh.leave();
        return;
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

  // Deep-linked ?chess= games initialize directly in useState above (remounted via key in App.tsx)

  // Listen for random opponent pairing on global LobbyHub
  useEffect(() => {
    if (viewMode !== 'searching' || !currentUser) return;

    lobbySocket.joinChessQueue(
      { id: currentUser.id, alias: currentUser.alias, avatar: currentUser.avatar },
      selectedTimeMs
    );

    const unsub = lobbySocket.subscribe((event) => {
      if (event.type === 'chess_matched' && viewModeRef.current === 'searching') {
        playUiSound('unlock');
        lobbySocket.leaveChessQueue();
        setPreferredColor(event.color);
        setMyColor(event.color);
        setSelectedTimeMs(event.timeControlMs);
        setActiveGameId(event.gameId);
        setGameMode('online');
        const mePlayer: ChessPlayerInfo = {
          id: currentUser.id,
          alias: currentUser.alias,
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

  // Smooth countdown clock & timeout enforcement
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
  }, [viewMode, chessState.status, chessState.moveCount, chessState.lastMoveAt, chessState.turn, chessState.whiteTimeMs, chessState.blackTimeMs, gameMode, wsConnected]);

  // Celebrate wins cleanly once per game over transition
  const prevStatusRef = useRef(chessState.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = chessState.status;
    if (prev !== chessState.status && (chessState.status === 'checkmate' || chessState.status === 'resigned' || chessState.status === 'timeout')) {
      if (chessState.winner === myColor) {
        playUiSound('unlock');
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#CCFF00', '#00F0FF', '#8B5CF6'],
        });
      } else {
        playUiSound('chime');
      }
    }
  }, [chessState.status, chessState.winner, myColor]);

  // Derived Chess instance & legal target highlights (load PGN when present so Move History populates)
  const chessInstance = useMemo(
    () => loadChessGame(chessState.fen, chessState.pgn),
    [chessState.fen, chessState.pgn]
  );

  const legalDestinations = useMemo(() => {
    if (!selectedSquare) return new Map<string, boolean>();
    const map = new Map<string, boolean>();
    try {
      const moves = chessInstance.moves({ square: selectedSquare, verbose: true });
      for (const m of moves) {
        map.set(m.to, Boolean(m.captured));
      }
    } catch {
      // Ignore invalid square
    }
    return map;
  }, [chessInstance, selectedSquare]);

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
        playUiSound('click');
        applyLocalMove(mv.from as Square, mv.to as Square, mv.promotion || 'q');
      }
    }, 550);

    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, [viewMode, gameMode, chessState.status, chessState.turn, chessState.fen, myColor, applyLocalMove]);

  const executePlayerMove = (from: Square, to: Square, promotion: 'q' | 'r' | 'b' | 'n' = 'q') => {
    const testGame = new Chess(chessState.fen);
    try {
      const valid = testGame.move({ from, to, promotion });
      if (!valid) return;
    } catch {
      return;
    }

    playUiSound(testGame.inCheck() ? 'pop' : 'click');
    setSelectedSquare(null);
    setPendingPromotion(null);

    if (gameMode === 'online' && meshRef.current && wsConnected) {
      meshRef.current.sendCustomJson({
        type: 'chess_move',
        from,
        to,
        promotion,
      });
    } else {
      applyLocalMove(from, to, promotion);
    }
  };

  const handleSquareClick = (sq: Square) => {
    if (chessState.status !== 'active' && chessState.status !== 'waiting') return;
    if (gameMode === 'online' && chessState.status === 'waiting') {
      setMediaNotice('Waiting for opponent to open your invite link!');
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

        if (isPromo) {
          setPendingPromotion({ from: selectedSquare, to: sq });
        } else {
          executePlayerMove(selectedSquare, sq, 'q');
        }
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

  const handleStartRandomMatch = () => {
    playUiSound('pop');
    if (!currentUser) {
      onOpenOnboarding();
      return;
    }
    setViewMode('searching');
  };

  const handleCreateFriendLink = () => {
    playUiSound('pop');
    if (!currentUser) {
      onOpenOnboarding();
      return;
    }
    const newGameId = `chess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setActiveGameId(newGameId);
    setPreferredColor('w');
    setMyColor('w');
    setGameMode('online');
    setChessState(
      createInitialGameState(selectedTimeMs, {
        id: currentUser.id,
        alias: currentUser.alias,
        avatar: currentUser.avatar,
      })
    );
    setChatMessages([]);
    setViewMode('game');
  };

  const handleStartBotMatch = () => {
    playUiSound('unlock');
    const meInfo: ChessPlayerInfo = currentUser
      ? { id: currentUser.id, alias: currentUser.alias, avatar: currentUser.avatar }
      : {
          id: 'guest-chess',
          alias: 'GuestPlayer',
          avatar: { bg: 'from-lime-400 to-emerald-700', emoji: '♟️' },
        };
    const taraBot: ChessPlayerInfo = {
      id: 'bot-tara',
      alias: 'Tara Bot (Club)',
      avatar: { bg: 'from-pink-500 to-rose-700', emoji: '🤖' },
    };

    setActiveGameId('bot-practice');
    setMyColor('w');
    setPreferredColor('w');
    setGameMode('bot');
    setChessState(createInitialGameState(selectedTimeMs, meInfo, taraBot));
    setChatMessages([
      {
        id: 'bot_intro',
        sender_id: 'bot-tara',
        sender_alias: 'Tara Bot',
        text: 'gl hf! white moves first — make your opening move ♟️',
        created_at: new Date().toISOString(),
      },
    ]);
    setViewMode('game');
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
      setIsMicMuted((prev) => !prev);
      return;
    }

    // Request mic on demand if initial silent stream was used
    if (!localAudioStreamRef.current) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
      if (localCamStreamRef.current) {
        localCamStreamRef.current.getTracks().forEach((t) => t.stop());
        localCamStreamRef.current = null;
      }
      setLocalVideoStream(null);
      setIsCameraOn(false);
      await meshRef.current?.setLocalVideoTrack(null);
      return;
    }

    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
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
      setMediaNotice('Camera permission unavailable or blocked on this device.');
      setTimeout(() => setMediaNotice(''), 3500);
    }
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
      // Bot accepts draws only if material is near equal
      setChessState((prev) => ({ ...prev, status: 'draw', winner: 'draw', drawOfferBy: null }));
    }
  };

  const handleRematch = () => {
    playUiSound('unlock');
    if (gameMode === 'online' && meshRef.current && wsConnected) {
      meshRef.current.sendCustomJson({ type: 'chess_rematch' });
    } else {
      const nextColor: 'w' | 'b' = myColor === 'w' ? 'b' : 'w';
      setMyColor(nextColor);
      setChessState((prev) =>
        createInitialGameState(prev.timeControlMs, prev.black, prev.white)
      );
    }
  };

  // -------------------- LOBBY VIEW --------------------
  if (viewMode === 'lobby') {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="relative overflow-hidden bg-[#111116] border-2 border-cyan-400/50 rounded-3xl p-6 sm:p-8 shadow-neo">
          <div className="absolute -right-12 -top-12 w-52 h-52 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />
          <div className="relative max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-xs font-mono font-bold">
              <Video className="w-3.5 h-3.5" />
              <span>MULTIPLAYER CHESS + VOICE & OPTIONAL CAMERA</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-heading font-black text-white">
              Play Real-Time Chess & Talk Live ♟️🎙️
            </h2>
            <p className="text-sm text-white/70 leading-relaxed">
              Match with online humans or send an invite link to a friend. Voice &amp; optional face cam run P2P right beside the board — Camera stays OFF unless you tap it!
            </p>

            {/* Time Control Selector */}
            <div className="pt-2">
              <label className="block text-[11px] font-mono uppercase tracking-wider text-white/50 mb-2">
                Select Time Control
              </label>
              <div className="flex flex-wrap gap-2">
                {CHESS_TIME_OPTIONS.map((opt) => (
                  <button
                    key={opt.ms}
                    type="button"
                    onClick={() => {
                      playUiSound('click');
                      setSelectedTimeMs(opt.ms);
                    }}
                    className={`px-4 py-2 rounded-xl font-mono text-xs font-bold border transition-all flex items-center gap-2 ${
                      selectedTimeMs === opt.ms
                        ? 'bg-[#CCFF00] text-black border-[#CCFF00]'
                        : 'bg-[#070709] text-white/75 border-white/15 hover:border-white/40'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                    <span className="opacity-70">({opt.badge})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3 Launch Modes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
              <button
                type="button"
                onClick={handleStartRandomMatch}
                className="p-4 rounded-2xl bg-gradient-to-br from-[#CCFF00] to-emerald-400 text-black font-heading font-black text-left border-2 border-black hover:scale-[1.02] transition-all shadow-neo space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base">🎲 Random Opponent</span>
                  <Swords className="w-4 h-4" />
                </div>
                <p className="text-xs font-body font-medium text-black/80">
                  Instant pairing with online Gen Z players
                </p>
              </button>

              <button
                type="button"
                onClick={handleCreateFriendLink}
                className="p-4 rounded-2xl bg-[#181822] hover:bg-[#1f1f2d] text-white font-heading font-bold text-left border-2 border-cyan-400/50 hover:border-cyan-400 transition-all space-y-1"
              >
                <div className="flex items-center justify-between text-cyan-300">
                  <span className="text-base">🔗 Challenge Friend</span>
                  <Link2 className="w-4 h-4" />
                </div>
                <p className="text-xs font-body text-white/65">
                  Create private board &amp; share invite link
                </p>
              </button>

              <button
                type="button"
                onClick={handleStartBotMatch}
                className="p-4 rounded-2xl bg-[#181822] hover:bg-[#1f1f2d] text-white font-heading font-bold text-left border border-white/15 hover:border-violet-400 transition-all space-y-1"
              >
                <div className="flex items-center justify-between text-violet-300">
                  <span className="text-base">🤖 Practice vs Tara</span>
                  <Crown className="w-4 h-4" />
                </div>
                <p className="text-xs font-body text-white/65">
                  Warm up offline or solo anytime
                </p>
              </button>
            </div>
          </div>
        </div>
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
            Finding Chess Opponent...
          </h3>
          <p className="text-xs sm:text-sm font-mono text-white/60">
            Joined global Cloudflare Durable Objects queue ({formatChessClock(selectedTimeMs)}). Open a second tab or phone to test instant 1v1 pairing!
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleCreateFriendLink}
            className="px-5 py-2.5 rounded-xl bg-cyan-500/15 border border-cyan-400/50 text-cyan-300 text-xs font-mono font-bold hover:bg-cyan-500/25"
          >
            🔗 Create Share Link Instead
          </button>
          <button
            type="button"
            onClick={handleStartBotMatch}
            className="px-5 py-2.5 rounded-xl bg-violet-500/15 border border-violet-400/40 text-violet-300 text-xs font-mono font-bold hover:bg-violet-500/25"
          >
            🤖 Practice vs Tara Bot
          </button>
          <button
            type="button"
            onClick={() => {
              lobbySocket.leaveChessQueue();
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

  const displayRanks = myColor === 'w' ? RANKS_WHITE : RANKS_BLACK;
  const displayFiles = myColor === 'w' ? FILES : FILES_BLACK;
  const parsedMoves = chessInstance.history();
  const isMyTurn = chessState.turn === myColor;
  const isCheck = chessInstance.inCheck();

  const board = chessInstance.board();

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111116] border border-white/15 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-xs font-mono font-bold">
            ♟️ {gameMode === 'bot' ? 'VS TARA BOT' : wsConnected ? 'LIVE D1/DO SYNC' : 'LOCAL SYNC'}
          </span>
          {chessState.status === 'waiting' && (
            <span className="text-xs font-mono text-amber-300 truncate">
              Waiting for friend to join...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
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
        <div className="px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 text-xs font-mono">
          {mediaNotice}
        </div>
      )}

      {/* Draw Offer Banner */}
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

      {/* Game Over Result Banner */}
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
              Result: {chessState.status}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRematch}
            className="px-4 py-2 rounded-xl bg-[#CCFF00] text-black font-heading font-black text-xs flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Rematch</span>
          </button>
        </div>
      )}

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Board Column */}
        <div className="lg:col-span-7 space-y-3 min-w-0">
          {/* Opponent Player Strip */}
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
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                    {oppColor === 'w' ? 'White' : 'Black'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono text-white/50">
                  {(oppColor === 'w' ? material.capturedByWhite : material.capturedByBlack).length > 0 ? (
                    <span>
                      {(oppColor === 'w' ? material.capturedByWhite : material.capturedByBlack)
                        .map((p) => p.toUpperCase())
                        .join(' ')}
                    </span>
                  ) : (
                    <span>No captures yet</span>
                  )}
                </div>
              </div>
            </div>

            <div
              className={`px-3 py-1.5 rounded-xl font-mono text-sm font-black border ${
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
                      {/* Coordinate labels along bottom/left edges */}
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

            {/* Pawn Promotion Selector Overlay */}
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
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#CCFF00]/15 text-[#CCFF00]">
                    {myColor === 'w' ? 'White' : 'Black'}
                  </span>
                  {isMyTurn && chessState.status === 'active' && (
                    <span className="text-[10px] font-mono text-[#CCFF00]">• Your Turn</span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-white/50">
                  {material.advantageWhite !== 0
                    ? `Advantage: ${
                        (myColor === 'w' ? material.advantageWhite : -material.advantageWhite) > 0
                          ? '+'
                          : ''
                      }${myColor === 'w' ? material.advantageWhite : -material.advantageWhite}`
                    : 'Material Equal'}
                </div>
              </div>
            </div>

            <div
              className={`px-3 py-1.5 rounded-xl font-mono text-sm font-black border ${
                chessState.status === 'active' && isMyTurn
                  ? 'bg-[#CCFF00] text-black border-[#CCFF00]'
                  : 'bg-[#070709] text-white/80 border-white/15'
              }`}
            >
              {formatChessClock(myClockMs)}
            </div>
          </div>

          {/* Match Action Controls */}
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

        {/* Right: Video Chat & Move/Banter Column */}
        <div className="lg:col-span-5 space-y-4 min-w-0">
          {/* Live Voice & Video Chat Panel */}
          <div className="relative bg-[#111116] border border-cyan-400/30 rounded-3xl p-4 space-y-3 overflow-hidden">
            {/* Floating Emoji Burst */}
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

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-300" />
                <span className="font-heading font-bold text-sm text-white">
                  Voice &amp; Video Chat
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-white/60">
                {gameMode === 'bot'
                  ? 'Bot Mode'
                  : remoteConnected
                  ? '🟢 Peer Linked'
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
                  {isMicMuted ? '🔇 Mic Off' : '🎙️ Mic On'}
                </span>
              </div>
            </div>

            {/* Mic & Camera Toggle Controls */}
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
                <span>{isCameraOn ? 'Cam Off' : 'Cam On'}</span>
              </button>
            </div>
          </div>

          {/* Chat / Moves Card */}
          <div className="bg-[#111116] border border-white/15 rounded-3xl overflow-hidden flex flex-col h-[280px]">
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
                      Drop a glhf or roast a blunder here...
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
