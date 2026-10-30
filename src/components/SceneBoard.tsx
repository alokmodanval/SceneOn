import React, { useState } from 'react';
import {
  Sparkles,
  MessageCircle,
  Filter,
  Check,
  Flame,
  Clock,
  Zap,
} from 'lucide-react';
import { SceneUser } from '../types';
import { calculateSceneMatch, getMatchBadgeStyle } from '../lib/matchAlgorithm';
import { formatRelativeTime, isFreshWithin24Hours } from '../lib/identity';
import { ALL_TAGS } from '../lib/constants';
import { playUiSound } from '../lib/audioEngine';

interface SceneBoardProps {
  peers: SceneUser[];
  currentUser: SceneUser | null;
  onOpenChat: (peer: SceneUser) => void;
  onOpenOnboarding: () => void;
}

export const SceneBoard: React.FC<SceneBoardProps> = ({
  peers,
  currentUser,
  onOpenChat,
  onOpenOnboarding,
}) => {
  const [selectedFilterTag, setSelectedFilterTag] = useState<string>('all');

  // Filter peers:
  // 1. Exclude self
  // 2. Must be within 24h freshness rule
  // 3. Low-Aura Shadow Filter (aura must be >= 0)
  // 4. Tag filter if selected
  const activePeers = peers.filter((peer) => {
    if (currentUser && peer.id === currentUser.id) return false;
    if (!isFreshWithin24Hours(peer.last_seen)) return false;
    if ((peer.scene_aura ?? 5) < 0) return false;
    if (selectedFilterTag !== 'all' && !peer.tags?.includes(selectedFilterTag)) return false;
    return true;
  });

  // Calculate match scores and sort by highest Match %
  const scoredPeers = activePeers.map((peer) => {
    const match = calculateSceneMatch(currentUser, peer);
    return { peer, match };
  });

  scoredPeers.sort((a, b) => b.match.totalMatch - a.match.totalMatch);

  const handlePeerChat = (peer: SceneUser) => {
    playUiSound('click');
    if (!currentUser) {
      onOpenOnboarding();
      return;
    }
    onOpenChat(peer);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Vibe Tag Filters Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <button
          onClick={() => {
            playUiSound('pop');
            setSelectedFilterTag('all');
          }}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold whitespace-nowrap transition-all border ${
            selectedFilterTag === 'all'
              ? 'bg-[#CCFF00] text-black border-black shadow-neo-sm'
              : 'bg-[#111116] text-white/70 border-white/10 hover:border-white/30'
          }`}
        >
          All Vibes ({activePeers.length})
        </button>

        {ALL_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => {
              playUiSound('pop');
              setSelectedFilterTag(tag);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border ${
              selectedFilterTag === tag
                ? 'bg-[#CCFF00] text-black font-bold border-black shadow-neo-sm'
                : 'bg-[#111116] text-white/70 border-white/10 hover:border-white/30'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Empty State */}
      {scoredPeers.length === 0 && (
        <div className="text-center py-12 sm:py-16 px-6 rounded-3xl bg-[#111116] border-2 border-white/10 hover:border-[#CCFF00]/40 transition-colors max-w-xl mx-auto space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#CCFF00]/10 border border-[#CCFF00]/30 flex items-center justify-center text-3xl mx-auto shadow-glow-lime">
            ⚡
          </div>
          <div>
            <span className="text-xs font-mono font-bold text-[#CCFF00] uppercase tracking-wider">
              {currentUser ? "YOU'RE ON THE SCENE BOARD" : '100% REAL GEN Z COMMUNITY'}
            </span>
            <h3 className="font-heading font-black text-2xl text-white mt-1">
              {currentUser ? 'Waiting for Your Next Vibe Match' : 'The Scene Board is Fresh!'}
            </h3>
            <p className="text-xs sm:text-sm text-white/60 max-w-md mx-auto mt-2 leading-relaxed">
              {currentUser
                ? 'Your vibe frequencies are locked in. Share your 1080x1920 Story Card on Instagram or WhatsApp to invite friends to test their compatibility score with you!'
                : 'No fake bot accounts or ghost profiles. Take 15 seconds to set your scene, tune your 3 vibe frequencies, and get matched with real people.'}
            </p>
          </div>

          <div className="pt-2">
            {!currentUser ? (
              <button
                onClick={() => {
                  playUiSound('click');
                  onOpenOnboarding();
                }}
                className="neo-btn-lime px-6 py-3 rounded-xl text-xs font-bold inline-flex items-center gap-2"
              >
                <span>⚡ Set My Scene (15s)</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  playUiSound('click');
                  window.dispatchEvent(new CustomEvent('sceneon-open-storycard'));
                }}
                className="neo-btn-lime px-6 py-3 rounded-xl text-xs font-bold inline-flex items-center gap-2"
              >
                <span>📸 Share Story Card to Invite</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scene Matches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {scoredPeers.map(({ peer, match }) => {
          const badge = getMatchBadgeStyle(match.totalMatch);

          return (
            <div
              key={peer.id}
              className="relative flex flex-col justify-between p-5 rounded-2xl bg-[#111116] border border-white/10 hover:border-[#CCFF00]/50 transition-all duration-300 hover:shadow-neo-sm group"
            >
              <div>
                {/* Header Row: Avatar, Alias, Match Badge */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div
                        className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${peer.avatar?.bg} flex items-center justify-center text-xl shadow-md border border-white/20`}
                      >
                        {peer.avatar?.emoji || '⚡'}
                      </div>
                      {/* Online dot indicator */}
                      {peer.is_online ? (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCFF00] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-[#CCFF00] border-2 border-[#111116]"></span>
                        </span>
                      ) : (
                        <span
                          title={`Active ${formatRelativeTime(peer.last_seen)}`}
                          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-white/40 border-2 border-[#111116]"
                        />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-heading font-bold text-white text-base group-hover:text-[#CCFF00] transition-colors">
                          {peer.alias}
                        </h3>
                      </div>
                      <span className="text-[11px] font-mono text-[#CCFF00] font-bold">
                        +{peer.scene_aura || 5} Aura ⚡
                      </span>
                    </div>
                  </div>

                  {/* Match % Pill */}
                  <div
                    className={`px-2.5 py-1 rounded-xl border font-mono text-xs font-bold flex flex-col items-end ${badge.bg} ${badge.border} ${badge.text}`}
                  >
                    <span>{match.totalMatch}% MATCH</span>
                    <span className="text-[9px] font-sans font-medium opacity-80">
                      {badge.label}
                    </span>
                  </div>
                </div>

                {/* Icebreaker Prompt Quotation Box */}
                <div className="p-3.5 rounded-xl bg-[#070709] border border-white/5 mb-4 text-left">
                  <span className="text-[10px] font-mono text-[#CCFF00] block mb-1 uppercase tracking-wider font-bold">
                    ICEBREAKER PROMPT:
                  </span>
                  <p className="text-xs sm:text-sm text-white/90 italic line-clamp-3">
                    &quot;{peer.scene_prompt}&quot;
                  </p>
                </div>

                {/* Tags Pill Box */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {(peer.tags || []).slice(0, 4).map((tag) => {
                    const isCommon = match.commonTags?.includes(tag);
                    return (
                      <span
                        key={tag}
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${
                          isCommon
                            ? 'bg-[#CCFF00]/15 text-[#CCFF00] border-[#CCFF00]/40 font-bold'
                            : 'bg-white/5 text-white/60 border-white/10'
                        }`}
                      >
                        {tag}
                      </span>
                    );
                  })}
                </div>

                {/* Quick Vibe Sliders Peek */}
                <div className="space-y-1.5 py-2 border-t border-white/5 text-[10px] font-mono text-white/50 mb-4">
                  <div className="flex justify-between items-center">
                    <span>Talk Frequency:</span>
                    <span className="text-white/80">
                      {peer.sliders?.talk < 40 ? 'Introvert 🤫' : 'Yapper 🗣️'} ({peer.sliders?.talk}%)
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Hustle Frequency:</span>
                    <span className="text-white/80">
                      {peer.sliders?.hustle < 40 ? 'Hustler ⚡' : 'Pure Chill 🍕'} ({peer.sliders?.hustle}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Break The Ice CTA */}
              <button
                onClick={() => handlePeerChat(peer)}
                className="w-full py-2.5 rounded-xl neo-btn-lime font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5 fill-black" />
                <span>🔥 Break The Ice</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
