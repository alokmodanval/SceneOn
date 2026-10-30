import React from 'react';
import { Sparkles, Radio, ShieldCheck, Zap, Users, Flame, ArrowRight } from 'lucide-react';
import { SceneUser } from '../types';
import { playUiSound } from '../lib/audioEngine';

interface HeroProps {
  currentUser: SceneUser | null;
  onOpenOnboarding: () => void;
  onSelectTab: (tab: 'voice' | 'matches') => void;
}

export const Hero: React.FC<HeroProps> = ({
  currentUser,
  onOpenOnboarding,
  onSelectTab,
}) => {
  return (
    <div className="relative overflow-hidden pt-8 pb-12 sm:pt-14 sm:pb-16 text-center">
      {/* Background Neon Aura Orbs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[300px] bg-gradient-to-r from-violet-600/20 via-[#CCFF00]/15 to-[#FF2E93]/20 blur-[100px] pointer-events-none rounded-full" />

      <div className="relative max-w-4xl mx-auto px-4 space-y-6">
        {/* Brand Tagline Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#111116] border border-[#CCFF00]/40 shadow-glow-lime text-xs font-mono font-bold text-[#CCFF00]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCFF00] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CCFF00]"></span>
          </span>
          <span>AAJ KA SCENE KYA HAI? • 100% ZERO-LOGIN</span>
        </div>

        {/* Big Neo-Brutalist Heading */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-heading font-black tracking-tight text-white leading-[1.08]">
          Find Your Vibe Match. <br className="hidden sm:inline" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#CCFF00] via-white to-violet-400">
            Hop On Live Voice Scenes.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="max-w-2xl mx-auto text-base sm:text-lg text-white/70 font-normal leading-relaxed">
          No signups, no passwords, no creeps. Pick your frequencies in 15 seconds, discover algorithmically matched Gen Z peers, or join 6-user P2P voice tables with anonymous voice masking.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          {!currentUser ? (
            <button
              onClick={() => {
                playUiSound('click');
                onOpenOnboarding();
              }}
              className="w-full sm:w-auto neo-btn-lime px-8 py-4 rounded-2xl text-base font-black flex items-center justify-center gap-2.5 shadow-neo"
            >
              <Zap className="w-5 h-5 fill-black" />
              <span>⚡ Set My Scene (15s)</span>
            </button>
          ) : (
            <button
              onClick={() => {
                playUiSound('click');
                onSelectTab('matches');
              }}
              className="w-full sm:w-auto neo-btn-lime px-8 py-4 rounded-2xl text-base font-black flex items-center justify-center gap-2.5 shadow-neo"
            >
              <Flame className="w-5 h-5 fill-black" />
              <span>Explore My Scene Matches</span>
            </button>
          )}

          <button
            onClick={() => {
              playUiSound('click');
              onSelectTab('voice');
            }}
            className="w-full sm:w-auto neo-btn-dark px-7 py-4 rounded-2xl text-base font-heading font-bold text-white flex items-center justify-center gap-2.5 border border-white/20"
          >
            <Radio className="w-5 h-5 text-[#CCFF00]" />
            <span>🔥 Check Live Scenes</span>
          </button>
        </div>

        {/* Zero-Cost & Safety Guarantees Badges */}
        <div className="pt-6 flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs font-mono text-white/60">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#CCFF00]" />
            <span>100% Free Forever (No Paywalls)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-violet-400" />
            <span>Zero-Login &quot;Scene Key&quot; Auth</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>10-Message Creep Guard</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-pink-400" />
            <span>Web Audio Voice Masking</span>
          </span>
        </div>
      </div>
    </div>
  );
};
