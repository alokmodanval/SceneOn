import React, { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  MessageCircle,
  Search,
  Swords,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  ChessHistoryRecord,
  FriendsDataPayload,
  SceneUser,
} from '../types';
import { formatRelativeTime } from '../lib/identity';
import { playUiSound } from '../lib/audioEngine';
import { searchPlayersByUsername } from '../lib/supabase';
import { OnlineBlueTick } from './OnlineBlueTick';

interface FriendsAndHistoryPanelProps {
  currentUser: SceneUser | null;
  friendsData: FriendsDataPayload;
  history: ChessHistoryRecord[];
  onlineUserIds: string[];
  onSendFriendRequest: (target: { toUserId?: string; toUsername?: string }) => Promise<string>;
  onRespondRequest: (requesterId: string, action: 'accept' | 'decline') => Promise<void>;
  onRemoveFriend: (friendId: string) => Promise<void>;
  onChallengePlayer: (player: { id: string; alias: string; username?: string; avatar: SceneUser['avatar'] }) => void;
  onOpenChat?: (user: SceneUser) => void;
  onRequireProfile: () => void;
}

export const FriendsAndHistoryPanel: React.FC<FriendsAndHistoryPanelProps> = ({
  currentUser,
  friendsData,
  history,
  onlineUserIds,
  onSendFriendRequest,
  onRespondRequest,
  onRemoveFriend,
  onChallengePlayer,
  onOpenChat,
  onRequireProfile,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'friends' | 'history'>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SceneUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [expandedPgnId, setExpandedPgnId] = useState<string | null>(null);

  const friendIds = new Set(friendsData.friends.map((f) => f.id));
  const pendingOutIds = new Set(friendsData.outgoingRequests.map((r) => r.user.id));

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(''), 3500);
  };

  const handleSearchPlayers = async (e: React.FormEvent) => {
    e.preventDefault();
    playUiSound('click');
    setIsSearching(true);
    const list = await searchPlayersByUsername(searchQuery, currentUser?.id);
    setSearchResults(list);
    setIsSearching(false);
  };

  const handleAddByHandle = async (user?: SceneUser) => {
    playUiSound('pop');
    if (!currentUser) {
      onRequireProfile();
      return;
    }
    const msg = await onSendFriendRequest(
      user ? { toUserId: user.id } : { toUsername: searchQuery.trim() }
    );
    showToast(msg);
  };

  return (
    <div className="bg-[#111116] border border-white/15 rounded-3xl overflow-hidden flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          type="button"
          onClick={() => {
            playUiSound('click');
            setActiveSubTab('friends');
          }}
          className={`flex-1 py-3 px-3 text-xs font-heading font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
            activeSubTab === 'friends'
              ? 'border-[#1D9BF0] text-[#38BDF8] bg-[#1D9BF0]/5'
              : 'border-transparent text-white/55 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Friends ({friendsData.friends.length})</span>
          {friendsData.incomingRequests.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-mono">
              {friendsData.incomingRequests.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            playUiSound('click');
            setActiveSubTab('history');
          }}
          className={`flex-1 py-3 px-3 text-xs font-heading font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
            activeSubTab === 'history'
              ? 'border-[#CCFF00] text-[#CCFF00] bg-[#CCFF00]/5'
              : 'border-transparent text-white/55 hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Game History ({history.length})</span>
        </button>
      </div>

      {feedbackMsg && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 text-xs font-mono">
          {feedbackMsg}
        </div>
      )}

      {activeSubTab === 'friends' ? (
        <div className="p-3.5 space-y-4 max-h-[430px] overflow-y-auto">
          {/* Search / Add Friend by @username */}
          <form onSubmit={handleSearchPlayers} className="flex gap-1.5">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find friend by @username..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#070709] border border-white/15 focus:border-[#38BDF8] text-xs text-white outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-3 py-2 rounded-xl bg-[#1D9BF0] hover:bg-sky-400 text-white text-xs font-heading font-bold flex-shrink-0"
            >
              {isSearching ? '...' : 'Find'}
            </button>
          </form>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase text-white/50 px-1">
                <span>Search Results ({searchResults.length})</span>
                <button
                  type="button"
                  onClick={() => setSearchResults([])}
                  className="text-white/40 hover:text-white"
                >
                  Clear
                </button>
              </div>
              {searchResults.map((p) => {
                const online = onlineUserIds.includes(p.id);
                const isFriend = friendIds.has(p.id);
                const isPending = pendingOutIds.has(p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#070709] border border-white/10"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full bg-gradient-to-tr ${p.avatar.bg} flex items-center justify-center text-sm flex-shrink-0`}
                      >
                        {p.avatar.emoji}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-heading font-bold text-white truncate">
                            {p.alias}
                          </span>
                          <OnlineBlueTick isOnline={online} size="xs" />
                        </div>
                        <span className="text-[10px] font-mono text-cyan-300 truncate block">
                          @{p.username || p.alias.toLowerCase()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => onChallengePlayer(p)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#CCFF00] text-black text-[11px] font-heading font-black flex items-center gap-1"
                        title="Send Live Chess Challenge"
                      >
                        <Swords className="w-3 h-3" />
                        <span>Play</span>
                      </button>
                      {!isFriend && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => void handleAddByHandle(p)}
                          className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-[#1D9BF0] disabled:opacity-50 text-white text-[11px] font-mono flex items-center gap-1"
                        >
                          <UserPlus className="w-3 h-3" />
                          <span>{isPending ? 'Sent' : 'Add'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Incoming Friend Requests */}
          {friendsData.incomingRequests.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono uppercase tracking-wider text-rose-300 px-1">
                Incoming Friend Requests ({friendsData.incomingRequests.length})
              </p>
              {friendsData.incomingRequests.map((req) => {
                const online = onlineUserIds.includes(req.user.id);
                return (
                  <div
                    key={req.friendshipId}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full bg-gradient-to-tr ${req.user.avatar.bg} flex items-center justify-center text-sm flex-shrink-0`}
                      >
                        {req.user.avatar.emoji}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-white truncate">{req.user.alias}</span>
                          <OnlineBlueTick isOnline={online} size="xs" />
                        </div>
                        <span className="text-[10px] font-mono text-white/60">
                          @{req.user.username || req.user.alias.toLowerCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => void onRespondRequest(req.user.id, 'accept')}
                        className="p-1.5 rounded-lg bg-[#1D9BF0] text-white"
                        aria-label="Accept friend request"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onRespondRequest(req.user.id, 'decline')}
                        className="p-1.5 rounded-lg bg-white/10 text-white/70"
                        aria-label="Decline friend request"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Accepted Friends List */}
          <div className="space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-white/45 px-1">
              Your ChessChat Friends
            </p>
            {friendsData.friends.length === 0 ? (
              <div className="text-center py-6 px-3 rounded-2xl bg-[#070709] border border-white/10 space-y-1">
                <p className="text-xs font-mono text-white/65">No friends added yet.</p>
                <p className="text-[11px] text-white/45">
                  Search any player&apos;s <span className="text-cyan-300">@username</span> above or add them right from a game!
                </p>
              </div>
            ) : (
              friendsData.friends.map((friend) => {
                const online = onlineUserIds.includes(friend.id);
                return (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#070709] border border-white/10 hover:border-cyan-400/40 transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-full bg-gradient-to-tr ${friend.avatar.bg} flex items-center justify-center text-base flex-shrink-0`}
                      >
                        {friend.avatar.emoji}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-heading font-bold text-white truncate">
                            {friend.alias}
                          </span>
                          <OnlineBlueTick isOnline={online} showLabel size="xs" />
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-white/50">
                          <span className="text-cyan-300">
                            @{friend.username || friend.alias.toLowerCase()}
                          </span>
                          {(friend.wins || friend.losses || friend.draws) ? (
                            <span>
                              {friend.wins || 0}W/{friend.losses || 0}L
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => onChallengePlayer(friend)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#CCFF00] hover:bg-lime-300 text-black text-[11px] font-heading font-black flex items-center gap-1"
                        title="Send game invite notification"
                      >
                        <Swords className="w-3 h-3" />
                        <span>Challenge</span>
                      </button>
                      {onOpenChat && (
                        <button
                          type="button"
                          onClick={() => onOpenChat(friend)}
                          aria-label={`Chat with ${friend.alias}`}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/75"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void onRemoveFriend(friend.id)}
                        aria-label={`Remove ${friend.alias}`}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-white/40 hover:text-rose-300"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="p-3.5 space-y-2.5 max-h-[430px] overflow-y-auto">
          {history.length === 0 ? (
            <div className="text-center py-8 px-3 rounded-2xl bg-[#070709] border border-white/10 space-y-1">
              <p className="text-xs font-mono text-white/65">No finished games recorded yet.</p>
              <p className="text-[11px] text-white/45">
                Every completed game saves here so you can rematch or add opponents later!
              </p>
            </div>
          ) : (
            history.map((g) => {
              const amWhite = currentUser?.id ? g.whiteId === currentUser.id : true;
              const oppId = amWhite ? g.blackId : g.whiteId;
              const oppAlias = (amWhite ? g.blackAlias : g.whiteAlias) || 'Opponent';
              const oppUsername = amWhite ? g.blackUsername : g.whiteUsername;
              const oppAvatar = amWhite ? g.blackAvatar : g.whiteAvatar;
              const mySide = amWhite ? 'w' : 'b';
              const outcome =
                g.winnerSide === 'draw' ? 'DRAW' : g.winnerSide === mySide ? 'WIN' : 'LOSS';
              const oppOnline = oppId ? onlineUserIds.includes(oppId) : false;
              const isFriend = oppId ? friendIds.has(oppId) : false;
              const isHuman = Boolean(oppId && !oppId.startsWith('bot-') && !g.isBot);
              const isExpanded = expandedPgnId === g.id;

              return (
                <div
                  key={g.id}
                  className="p-3 rounded-xl bg-[#070709] border border-white/10 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full bg-gradient-to-tr ${
                          oppAvatar?.bg || 'from-slate-600 to-slate-800'
                        } flex items-center justify-center text-sm flex-shrink-0`}
                      >
                        {oppAvatar?.emoji || '♟️'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-heading font-bold text-white truncate">
                            vs {oppAlias}
                          </span>
                          {isHuman && <OnlineBlueTick isOnline={oppOnline} size="xs" />}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-white/50">
                          {oppUsername && <span className="text-cyan-300">@{oppUsername}</span>}
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {Math.round(g.timeControlMs / 60000)}+0
                          </span>
                          <span>• {g.moveCount} moves</span>
                          <span>• {formatRelativeTime(g.endedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-black flex-shrink-0 ${
                        outcome === 'WIN'
                          ? 'bg-[#CCFF00]/20 text-[#CCFF00]'
                          : outcome === 'DRAW'
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {outcome}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {isHuman && oppId && (
                      <button
                        type="button"
                        onClick={() =>
                          onChallengePlayer({
                            id: oppId,
                            alias: oppAlias,
                            username: oppUsername,
                            avatar: oppAvatar || { bg: 'from-violet-600 to-indigo-900', emoji: '♟️' },
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-[#CCFF00] text-black text-[11px] font-heading font-black flex items-center gap-1"
                      >
                        <Swords className="w-3 h-3" />
                        <span>Request Rematch</span>
                      </button>
                    )}

                    {isHuman && oppId && !isFriend && (
                      <button
                        type="button"
                        disabled={pendingOutIds.has(oppId)}
                        onClick={() => void onSendFriendRequest({ toUserId: oppId }).then(showToast)}
                        className="px-2.5 py-1 rounded-lg bg-[#1D9BF0]/20 hover:bg-[#1D9BF0]/30 border border-[#1D9BF0]/40 disabled:opacity-50 text-[#38BDF8] text-[11px] font-mono flex items-center gap-1"
                      >
                        <UserPlus className="w-3 h-3" />
                        <span>{pendingOutIds.has(oppId) ? 'Requested' : 'Add Friend'}</span>
                      </button>
                    )}

                    {g.pgn && (
                      <button
                        type="button"
                        onClick={() => setExpandedPgnId(isExpanded ? null : g.id)}
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/65 text-[11px] font-mono flex items-center gap-1 ml-auto"
                      >
                        <span>Moves</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>

                  {isExpanded && g.pgn && (
                    <div className="p-2 rounded-lg bg-black/50 border border-white/10 font-mono text-[10px] text-white/75 break-words">
                      {g.pgn}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
