import React, { useState } from 'react';
import { Copy, Check, Key, Share2, Sparkles, SlidersHorizontal, Users } from 'lucide-react';
import { SceneUser } from '../types';
import { playUiSound } from '../lib/audioEngine';

interface HeaderProps {
  currentUser: SceneUser | null;
  onlineCount: number;
  onOpenOnboarding: () => void;
  onOpenRestore: () => void;
  onOpenStoryCard: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onlineCount,
  onOpenOnboarding,
  onOpenRestore,
  onOpenStoryCard,
}) => {
  const [copiedKey, setCopiedKey] = useState(false);

  const handleCopyKey = () => {
    if (!currentUser?.scene_key) return;
    navigator.clipboard.writeText(currentUser.scene_key);
    setCopiedKey(true);
    playUiSound('pop');
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#070709]/85 backdrop-blur-md border-b border-white/10 px-4 lg:px-8 py-3 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Logo & Tagline */}
        <div className="flex items-center gap-3">
          <div className="relative group cursor-pointer flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#111116] border-2 border-[#CCFF00] flex items-center justify-center shadow-neo-sm group-hover:scale-105 transition-transform">
              <span className="text-xl">⚡</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-black text-2xl tracking-tight text-white">
                  Scene<span className="text-[#CCFF00]">On</span>
                </span>
                <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                  Zero-Login
                </span>
              </div>
              <span className="hidden sm:block text-[11px] font-mono text-white/50">
                by tools4genz.com
              </span>
            </div>
          </div>

          {/* Live Gen Z Counter */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#111116] border border-white/10 text-xs font-mono">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCFF00] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CCFF00]"></span>
            </span>
            <Users className="w-3.5 h-3.5 text-[#CCFF00]" />
            <span className="text-white/80">
              <strong className="text-white font-bold">{onlineCount}</strong> {onlineCount === 1 ? 'Gen Z Online' : 'Gen Zs Scene On'}
            </span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {currentUser ? (
            <>
              {/* Scene Key Backup Pill */}
              <button
                onClick={handleCopyKey}
                title="Click to copy your private Scene Key"
                className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111116] border border-white/10 hover:border-[#CCFF00] text-xs font-mono transition-all group"
              >
                <Key className="w-3.5 h-3.5 text-violet-400 group-hover:text-[#CCFF00]" />
                <span className="text-white/70 group-hover:text-white">
                  {currentUser.scene_key}
                </span>
                {copiedKey ? (
                  <Check className="w-3.5 h-3.5 text-[#CCFF00]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-white/40 group-hover:text-white" />
                )}
              </button>

              {/* Story Card Share */}
              <button
                onClick={() => {
                  playUiSound('click');
                  onOpenStoryCard();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111116] border border-white/10 hover:border-[#FF2E93] text-xs font-semibold text-white/90 hover:text-white transition-all shadow-sm"
              >
                <Share2 className="w-3.5 h-3.5 text-[#FF2E93]" />
                <span className="hidden sm:inline">Story Card</span>
              </button>

              {/* User Profile Pill */}
              <div
                onClick={() => {
                  playUiSound('click');
                  onOpenOnboarding();
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111116] border border-white/15 hover:border-[#CCFF00] cursor-pointer transition-all"
              >
                <div
                  className={`w-7 h-7 rounded-full bg-gradient-to-tr ${currentUser.avatar.bg} flex items-center justify-center text-sm shadow-sm`}
                >
                  {currentUser.avatar.emoji}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-heading font-bold text-white leading-tight">
                    {currentUser.alias}
                  </span>
                  <span className="text-[10px] font-mono text-[#CCFF00] leading-tight">
                    +{currentUser.scene_aura} Aura ⚡
                  </span>
                </div>
                <SlidersHorizontal className="w-3 h-3 text-white/40 ml-1" />
              </div>
            </>
          ) : (
            <>
              {/* Restore Button */}
              <button
                onClick={() => {
                  playUiSound('click');
                  onOpenRestore();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111116] border border-white/15 hover:border-violet-500 text-xs font-mono text-white/80 hover:text-white transition-all"
              >
                <Key className="w-3.5 h-3.5 text-violet-400" />
                <span className="hidden sm:inline">Restore Scene</span>
                <span className="sm:hidden">Restore</span>
              </button>

              {/* Set My Scene CTA */}
              <button
                onClick={() => {
                  playUiSound('click');
                  onOpenOnboarding();
                }}
                className="neo-btn-lime px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold tracking-wide flex items-center gap-1.5 flex-shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 fill-black flex-shrink-0" />
                <span className="hidden sm:inline">⚡ Set My Scene (15s)</span>
                <span className="sm:hidden">⚡ Set Scene</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
