import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Mic,
  MicOff,
  RefreshCw,
  ShieldCheck,
  Video,
  X,
} from 'lucide-react';
import { createSilentAudioStream, createVolumeMeter, playUiSound } from '../lib/audioEngine';

interface PreGameMediaModalProps {
  isOpen: boolean;
  matchTitle: string;
  onCancel: () => void;
  onEnterMatch: (stream: MediaStream, cameraOn: boolean, micMuted: boolean) => void;
}

export const PreGameMediaModal: React.FC<PreGameMediaModalProps> = ({
  isOpen,
  matchTitle,
  onCancel,
  onEnterMatch,
}) => {
  const [status, setStatus] = useState<'requesting' | 'ready' | 'audio_only' | 'no_media'>('requesting');
  const [errorNote, setErrorNote] = useState('');
  const [cameraOn, setCameraOn] = useState(true);
  const [micMuted, setMicMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const meterCleanupRef = useRef<(() => void) | null>(null);
  const handedOffRef = useRef(false);

  const stopPreviewStream = () => {
    if (meterCleanupRef.current) {
      meterCleanupRef.current();
      meterCleanupRef.current = null;
    }
    if (streamRef.current && !handedOffRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const requestCameraAndMic = async () => {
    stopPreviewStream();
    handedOffRef.current = false;
    setStatus('requesting');
    setErrorNote('');

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000,
    };

    try {
      const fullStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24 },
          facingMode: 'user',
        },
        audio: audioConstraints,
      });

      streamRef.current = fullStream;
      setCameraOn(true);
      setMicMuted(false);
      setStatus('ready');

      if (videoRef.current) {
        videoRef.current.srcObject = fullStream;
      }
      if (fullStream.getAudioTracks().length > 0) {
        meterCleanupRef.current = createVolumeMeter(fullStream, (lvl) => {
          setAudioLevel(lvl);
        });
      }
    } catch (camErr) {
      // Fall back cleanly to crystal-clear audio-only if webcam missing or camera denied
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: audioConstraints,
        });
        streamRef.current = audioOnly;
        setCameraOn(false);
        setMicMuted(false);
        setStatus('audio_only');
        setErrorNote(
          camErr instanceof Error && camErr.name === 'NotAllowedError'
            ? 'Camera permission blocked — allow camera in browser or enter with clear voice only.'
            : 'No camera detected on this device — microphone is ready for crystal-clear voice chat.'
        );
        if (audioOnly.getAudioTracks().length > 0) {
          meterCleanupRef.current = createVolumeMeter(audioOnly, (lvl) => {
            setAudioLevel(lvl);
          });
        }
      } catch {
        // Fallback silent stream for headless or no-media environments
        streamRef.current = createSilentAudioStream();
        setCameraOn(false);
        setMicMuted(true);
        setStatus('no_media');
        setErrorNote('Camera & Microphone unavailable on this device — you can still play Chess & text chat.');
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) void requestCameraAndMic();
    });
    return () => {
      active = false;
      stopPreviewStream();
    };
  }, [isOpen]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = cameraOn ? streamRef.current : null;
    }
  }, [cameraOn, status]);

  if (!isOpen) return null;

  const handleTogglePreCam = () => {
    playUiSound('click');
    if (!streamRef.current) return;
    const videoTracks = streamRef.current.getVideoTracks();
    if (videoTracks.length === 0) {
      void requestCameraAndMic();
      return;
    }
    const next = !cameraOn;
    videoTracks.forEach((t) => {
      t.enabled = next;
    });
    setCameraOn(next);
  };

  const handleTogglePreMic = () => {
    playUiSound('click');
    if (!streamRef.current) return;
    const audioTracks = streamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;
    const nextMuted = !micMuted;
    audioTracks.forEach((t) => {
      t.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
  };

  const handleConfirm = () => {
    playUiSound('unlock');
    handedOffRef.current = true;
    const stream = streamRef.current || createSilentAudioStream();
    // If user explicitly turned camera OFF in preview, stop video tracks cleanly before entering
    if (!cameraOn) {
      stream.getVideoTracks().forEach((t) => {
        t.stop();
        stream.removeTrack(t);
      });
    }
    if (meterCleanupRef.current) {
      meterCleanupRef.current();
      meterCleanupRef.current = null;
    }
    onEnterMatch(stream, cameraOn && stream.getVideoTracks().length > 0, micMuted);
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-[#111116] border-2 border-cyan-400 rounded-3xl p-5 sm:p-6 shadow-neo space-y-4">
        <button
          type="button"
          onClick={() => {
            playUiSound('click');
            stopPreviewStream();
            onCancel();
          }}
          aria-label="Cancel match entry"
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/5 text-white/60 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="space-y-1 pr-6">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-[10px] font-mono font-bold">
            <Video className="w-3 h-3" />
            <span>PRE-GAME CAMERA &amp; CLEAR AUDIO CHECK</span>
          </div>
          <h3 className="font-heading font-black text-lg sm:text-xl text-white">
            {matchTitle}
          </h3>
          <p className="text-xs text-white/65">
            Allow camera &amp; mic before entering — you can turn off your camera anytime once the board starts.
          </p>
        </div>

        {/* Camera Preview Stage */}
        <div className="relative aspect-video rounded-2xl bg-[#070709] border border-white/15 overflow-hidden flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover scale-x-[-1] ${
              status === 'ready' && cameraOn ? 'block' : 'hidden'
            }`}
          />
          {status === 'requesting' && (
            <div className="text-center space-y-2 p-4">
              <div className="w-10 h-10 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mx-auto" />
              <p className="text-xs font-mono text-cyan-300">
                Requesting browser Camera &amp; Mic permission...
              </p>
            </div>
          )}
          {status !== 'requesting' && (!cameraOn || status !== 'ready') && (
            <div className="text-center space-y-2 p-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/15 flex items-center justify-center mx-auto text-white/50">
                <CameraOff className="w-6 h-6" />
              </div>
              <p className="text-xs font-mono text-white/70 max-w-xs">
                {errorNote || 'Camera is turned off — you can switch it ON anytime inside the game.'}
              </p>
            </div>
          )}

          {/* HD Audio Indicator Overlay */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-black/75 backdrop-blur-sm text-[11px] font-mono">
            <div className="flex items-center gap-1.5 text-[#CCFF00]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{micMuted ? 'Mic Muted' : 'Clear Voice (AEC + Noise Cut)'}</span>
            </div>
            <div className="flex items-center gap-0.5 h-3">
              {[1, 2, 3, 4, 5].map((bar) => (
                <span
                  key={bar}
                  className={`w-1 rounded-full transition-all ${
                    !micMuted && audioLevel > bar * 8 ? 'bg-[#CCFF00] h-3' : 'bg-white/20 h-1.5'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Toggle Controls */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleTogglePreCam}
            className={`py-2.5 px-3 rounded-xl font-heading font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
              cameraOn && status === 'ready'
                ? 'bg-cyan-400 text-black border-cyan-400'
                : 'bg-[#070709] text-white/80 border-white/15'
            }`}
          >
            {cameraOn && status === 'ready' ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
            <span>{cameraOn && status === 'ready' ? 'Camera ON' : 'Camera OFF'}</span>
          </button>

          <button
            type="button"
            onClick={handleTogglePreMic}
            className={`py-2.5 px-3 rounded-xl font-heading font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
              !micMuted
                ? 'bg-[#CCFF00] text-black border-[#CCFF00]'
                : 'bg-[#070709] text-white/80 border-white/15'
            }`}
          >
            {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span>{micMuted ? 'Mic Muted' : 'Mic Clear ON'}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {status !== 'ready' && status !== 'requesting' && (
            <button
              type="button"
              onClick={() => void requestCameraAndMic()}
              className="px-3.5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-mono text-white/80 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Cam</span>
            </button>
          )}
          <button
            type="button"
            disabled={status === 'requesting'}
            onClick={handleConfirm}
            className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-[#CCFF00] to-emerald-400 disabled:opacity-50 text-black font-heading font-black text-sm flex items-center justify-center gap-2 shadow-neo border-2 border-black"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Start Chess Match ♟️</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
