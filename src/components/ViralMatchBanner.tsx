import React from 'react';
import { Sparkles, MessageCircle, ArrowRight } from 'lucide-react';
import { SceneUser } from '../types';
import { calculateSceneMatch } from '../lib/matchAlgorithm';

interface ViralMatchBannerProps {
  inviterUser: SceneUser;
  currentUser: SceneUser | null;
  onOpenChat: (user: SceneUser) => void;
  onOpenOnboarding: () => void;
}

export const ViralMatchBanner: React.FC<ViralMatchBannerProps> = ({
  inviterUser,
  currentUser,
  onOpenChat,
  onOpenOnboarding,
}) => {
  const matchResult = currentUser ? calculateSceneMatch(currentUser, inviterUser) : null;

  return (
    <div className="w-full bg-gradient-to-r from-violet-900/60 via-obsidian to-[#CCFF00]/10 border-b border-[#CCFF00]/40 px-4 py-3 text-white">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${inviterUser.avatar.bg} flex items-center justify-center text-lg border border-white/20`}
          >
            {inviterUser.avatar.emoji}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#CCFF00] font-bold uppercase tracking-wider">
                ⚡ VIRAL VIBE INVITE
              </span>
              {matchResult && (
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-[#CCFF00] text-black">
                  {matchResult.totalMatch}% Match
                </span>
              )}
            </div>
            <p className="text-sm font-heading font-bold text-white">
              👀 <span className="text-[#CCFF00]">{inviterUser.alias}</span> invited you to check your Scene Match!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentUser ? (
            <button
              onClick={() => onOpenChat(inviterUser)}
              className="neo-btn-lime px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Chat With {inviterUser.alias}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={onOpenOnboarding}
              className="neo-btn-lime px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 fill-black" />
              <span>⚡ Set My Scene to Reveal Match</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
