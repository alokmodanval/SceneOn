import React, { useEffect, useRef, useState } from 'react';
import { Volume2, Music, CloudRain, Coffee, Radio, Play, Pause, X, Sparkles } from 'lucide-react';
import { ambientMixer, AmbientSoundType, playUiSound } from '../lib/audioEngine';

export const VibePlayer: React.FC = () => {
  const [activeType, setActiveType] = useState<AmbientSoundType>('none');
  const [volume, setVolume] = useState<number>(14);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleAmbientChange = (e: any) => {
      setActiveType(e.detail?.type || 'none');
    };
    window.addEventListener('friendsclub-ambient-change', handleAmbientChange);
    return () => {
      window.removeEventListener('friendsclub-ambient-change', handleAmbientChange);
    };
  }, []);

  // Click outside to dismiss popover
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [isOpen]);

  const handleTogglePlay = (type: AmbientSoundType) => {
    playUiSound('pop');
    if (activeType === type) {
      ambientMixer.stop();
    } else {
      ambientMixer.setAmbient(type, volume);
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    ambientMixer.setVolume(newVol);
  };

  const isPlaying = activeType !== 'none';

  return (
    <div className="relative" ref={containerRef}>
      {/* Vibe Player Pill Button */}
      <button
        onClick={() => {
          playUiSound('click');
          setIsOpen(!isOpen);
        }}
        title="Background Music & Ambience"
        className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-mono transition-all ${
          isPlaying
            ? 'bg-[#CCFF00]/15 border-[#CCFF00] text-[#CCFF00] shadow-glow-lime'
            : 'bg-[#111116] border-white/10 text-white/70 hover:border-white/30 hover:text-white'
        }`}
      >
        {isPlaying ? (
          <>
            {/* Animated Equalizer Wave Bars */}
            <span className="flex items-end gap-0.5 h-3.5 w-3.5">
              <span className="w-0.5 bg-[#CCFF00] rounded-full animate-[bounce_0.8s_infinite] h-2"></span>
              <span className="w-0.5 bg-[#CCFF00] rounded-full animate-[bounce_1.2s_infinite] h-3.5"></span>
              <span className="w-0.5 bg-[#CCFF00] rounded-full animate-[bounce_0.6s_infinite] h-1.5"></span>
              <span className="w-0.5 bg-[#CCFF00] rounded-full animate-[bounce_1s_infinite] h-3"></span>
            </span>
            <span className="hidden sm:inline font-bold">
              {activeType === 'lofi_beats'
                ? 'Lo-Fi Beats'
                : activeType === 'rain'
                ? 'Rain'
                : activeType === 'cafe'
                ? 'Tapri Chai'
                : 'Night Drone'}
            </span>
          </>
        ) : (
          <>
            <Music className="w-3.5 h-3.5 text-[#CCFF00]" />
            <span className="hidden sm:inline">Vibe Music</span>
          </>
        )}
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 max-w-[calc(100vw-1.5rem)] p-4 rounded-2xl bg-[#111116] border-2 border-white/20 shadow-neo z-50 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#CCFF00]" />
              <span>LO-FI VIBE PLAYER</span>
            </span>
            <div className="flex items-center gap-2">
              {isPlaying && (
                <button
                  onClick={() => {
                    playUiSound('click');
                    ambientMixer.stop();
                  }}
                  className="text-[10px] font-mono text-rose-400 hover:underline"
                >
                  Turn Off
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/40 hover:text-white p-1 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <p className="text-[11px] text-white/50 leading-tight">
            Background synthesizer audio generated live via Web Audio API. 100% free & offline friendly.
          </p>

          {/* Sound options */}
          <div className="space-y-1.5">
            <button
              onClick={() => handleTogglePlay('lofi_beats')}
              className={`w-full p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between transition-all ${
                activeType === 'lofi_beats'
                  ? 'bg-[#CCFF00] text-black font-bold border-black shadow-neo-sm'
                  : 'bg-[#15151c] border-white/10 text-white/80 hover:border-white/30'
              }`}
            >
              <div className="flex items-center gap-2 text-left">
                <Music className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <div>
                  <div className="font-bold">Chill Lo-Fi Chords</div>
                  <div className={`text-[10px] ${activeType === 'lofi_beats' ? 'text-black/70' : 'text-white/40'}`}>
                    Warm Rhodes jazzy chord loops + vinyl
                  </div>
                </div>
              </div>
              {activeType === 'lofi_beats' ? (
                <Pause className="w-4 h-4 fill-black flex-shrink-0" />
              ) : (
                <Play className="w-4 h-4 flex-shrink-0 text-white/50" />
              )}
            </button>

            <button
              onClick={() => handleTogglePlay('rain')}
              className={`w-full p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between transition-all ${
                activeType === 'rain'
                  ? 'bg-[#CCFF00] text-black font-bold border-black shadow-neo-sm'
                  : 'bg-[#15151c] border-white/10 text-white/80 hover:border-white/30'
              }`}
            >
              <div className="flex items-center gap-2 text-left">
                <CloudRain className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <div>
                  <div className="font-bold">Mumbai Rain Ambience</div>
                  <div className={`text-[10px] ${activeType === 'rain' ? 'text-black/70' : 'text-white/40'}`}>
                    Pink noise filtered monsoon raindrops
                  </div>
                </div>
              </div>
              {activeType === 'rain' ? (
                <Pause className="w-4 h-4 fill-black flex-shrink-0" />
              ) : (
                <Play className="w-4 h-4 flex-shrink-0 text-white/50" />
              )}
            </button>

            <button
              onClick={() => handleTogglePlay('cafe')}
              className={`w-full p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between transition-all ${
                activeType === 'cafe'
                  ? 'bg-[#CCFF00] text-black font-bold border-black shadow-neo-sm'
                  : 'bg-[#15151c] border-white/10 text-white/80 hover:border-white/30'
              }`}
            >
              <div className="flex items-center gap-2 text-left">
                <Coffee className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div>
                  <div className="font-bold">Tapri Chai & Cafe Crackle</div>
                  <div className={`text-[10px] ${activeType === 'cafe' ? 'text-black/70' : 'text-white/40'}`}>
                    Vintage analog vinyl grit & buzz
                  </div>
                </div>
              </div>
              {activeType === 'cafe' ? (
                <Pause className="w-4 h-4 fill-black flex-shrink-0" />
              ) : (
                <Play className="w-4 h-4 flex-shrink-0 text-white/50" />
              )}
            </button>

            <button
              onClick={() => handleTogglePlay('lofi')}
              className={`w-full p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between transition-all ${
                activeType === 'lofi'
                  ? 'bg-[#CCFF00] text-black font-bold border-black shadow-neo-sm'
                  : 'bg-[#15151c] border-white/10 text-white/80 hover:border-white/30'
              }`}
            >
              <div className="flex items-center gap-2 text-left">
                <Radio className="w-4 h-4 text-pink-400 flex-shrink-0" />
                <div>
                  <div className="font-bold">432Hz Midnight Drone</div>
                  <div className={`text-[10px] ${activeType === 'lofi' ? 'text-black/70' : 'text-white/40'}`}>
                    Calming dual sinusoidal focus drone
                  </div>
                </div>
              </div>
              {activeType === 'lofi' ? (
                <Pause className="w-4 h-4 fill-black flex-shrink-0" />
              ) : (
                <Play className="w-4 h-4 flex-shrink-0 text-white/50" />
              )}
            </button>
          </div>

          {/* Volume slider */}
          {isPlaying && (
            <div className="pt-2 border-t border-white/10 space-y-1">
              <div className="flex justify-between items-center text-[10px] font-mono text-white/60">
                <span className="flex items-center gap-1">
                  <Volume2 className="w-3 h-3 text-[#CCFF00]" />
                  <span>Vibe Volume</span>
                </span>
                <span>{volume}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="30"
                value={volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-full accent-[#CCFF00]"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
