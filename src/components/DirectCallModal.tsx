import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { SceneUser } from '../types';
import { createSilentAudioStream, createVolumeMeter, playUiSound } from '../lib/audioEngine';
import { WebRTCMeshRoom } from '../lib/webrtcMesh';

interface DirectCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: SceneUser;
  targetUser: SceneUser;
  chatId: string;
}

export const DirectCallModal: React.FC<DirectCallModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  targetUser,
  chatId,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callNotice, setCallNotice] = useState<string | null>(null);

  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const rawStreamRef = useRef<MediaStream | null>(null);
  const meshRef = useRef<WebRTCMeshRoom | null>(null);
  const meterCleanupRef = useRef<(() => void) | null>(null);
  const remoteMeterCleanupRef = useRef<(() => void) | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;

    async function startCall() {
      setCallDuration(0);
      setIsMuted(false);
      isMutedRef.current = false;
      setIsLocalSpeaking(false);
      setIsRemoteSpeaking(false);
      setCallNotice(null);

      let stream: MediaStream;
      let micReady = true;

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        rawStreamRef.current = stream;

        meterCleanupRef.current = createVolumeMeter(stream, (_level, isSpeaking) => {
          const active = isSpeaking && !isMutedRef.current;
          setIsLocalSpeaking(active);
          meshRef.current?.broadcastSpeaking(active);
        });
      } catch (err) {
        console.warn('Call microphone fallback to silent stream:', err);
        micReady = false;
        setIsMuted(true);
        isMutedRef.current = true;
        setCallNotice('Mic unavailable — connected in listen-only mode.');
        stream = createSilentAudioStream();
      }

      if (isCancelled) return;

      const callRoomId = `call_${chatId}`;
      const mesh = new WebRTCMeshRoom(
        callRoomId,
        currentUser.id,
        currentUser.alias,
        {
          onRemoteStream: (_peerId, remoteStream) => {
            if (remoteMeterCleanupRef.current) {
              remoteMeterCleanupRef.current();
            }
            remoteMeterCleanupRef.current = createVolumeMeter(remoteStream, (_level, isSpeaking) => {
              setIsRemoteSpeaking(isSpeaking);
            });
          },
          onPeerLeave: () => {
            setCallNotice(`${targetUser.alias} left the call.`);
            closeTimeoutRef.current = setTimeout(() => onClose(), 1200);
          },
          onReaction: () => {},
          onTopicChange: () => {},
          onPeerSpeaking: (_peerId, speaking) => {
            setIsRemoteSpeaking(speaking);
          },
        },
        currentUser.avatar,
        !micReady
      );

      meshRef.current = mesh;
      await mesh.start(stream, 'speaker', 1);
    }

    startCall();

    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    return () => {
      isCancelled = true;
      clearInterval(timer);
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      if (rawStreamRef.current) {
        rawStreamRef.current.getTracks().forEach((t) => t.stop());
        rawStreamRef.current = null;
      }
      if (meterCleanupRef.current) {
        meterCleanupRef.current();
        meterCleanupRef.current = null;
      }
      if (remoteMeterCleanupRef.current) {
        remoteMeterCleanupRef.current();
        remoteMeterCleanupRef.current = null;
      }
      if (meshRef.current) {
        meshRef.current.leave();
        meshRef.current = null;
      }
    };
  }, [isOpen, chatId, currentUser.id, currentUser.alias, currentUser.avatar, targetUser.alias, onClose]);

  if (!isOpen) return null;

  const toggleMic = () => {
    if (!rawStreamRef.current) {
      setCallNotice('Microphone permission is required to unmute.');
      return;
    }
    playUiSound('pop');
    const nextState = !isMuted;
    setIsMuted(nextState);
    isMutedRef.current = nextState;
    if (nextState) setIsLocalSpeaking(false);

    rawStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !nextState;
    });
    meshRef.current?.broadcastMuteState(nextState);
  };

  const handleEndCall = () => {
    playUiSound('kick');
    onClose();
  };

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#111116] border-2 border-[#CCFF00] rounded-3xl p-6 sm:p-8 shadow-neo text-center space-y-6">
        <div className="flex items-center justify-center gap-2">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCFF00] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#CCFF00]"></span>
          </span>
          <span className="text-xs font-mono font-bold text-[#CCFF00] uppercase tracking-wider">
            1-ON-1 P2P ENCRYPTED CALL
          </span>
        </div>

        {callNotice && (
          <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 text-xs font-mono">
            {callNotice}
          </div>
        )}

        <div className="flex items-center justify-center gap-6 py-4">
          <div className="flex flex-col items-center">
            <div
              className={`w-20 h-20 rounded-full bg-gradient-to-tr ${currentUser.avatar.bg} flex items-center justify-center text-3xl border-2 transition-all ${
                isLocalSpeaking
                  ? 'border-[#CCFF00] shadow-glow-lime scale-105'
                  : 'border-white/20'
              }`}
            >
              {currentUser.avatar.emoji}
            </div>
            <span className="text-xs font-heading font-bold text-white mt-2">
              {currentUser.alias}
            </span>
          </div>

          <div className="text-xl font-bold text-[#CCFF00]">⚡</div>

          <div className="flex flex-col items-center">
            <div
              className={`w-20 h-20 rounded-full bg-gradient-to-tr ${targetUser.avatar.bg} flex items-center justify-center text-3xl border-2 transition-all ${
                isRemoteSpeaking
                  ? 'border-[#CCFF00] shadow-glow-lime scale-105'
                  : 'border-white/20'
              }`}
            >
              {targetUser.avatar.emoji}
            </div>
            <span className="text-xs font-heading font-bold text-white mt-2">
              {targetUser.alias}
            </span>
          </div>
        </div>

        <div className="font-mono text-2xl font-bold text-white/90">
          {formatTime(callDuration)}
        </div>

        <div className="flex items-center justify-center gap-4 pt-4 border-t border-white/10">
          <button
            onClick={toggleMic}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={`p-4 rounded-2xl border-2 transition-all ${
              isMuted
                ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                : 'bg-white/10 border-white/20 text-white hover:border-[#CCFF00]'
            }`}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          <button
            onClick={handleEndCall}
            aria-label="End voice call"
            className="p-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white border-2 border-black shadow-neo-pink transition-all"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
