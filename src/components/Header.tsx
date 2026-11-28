import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  Check,
  Copy,
  Crown,
  Heart,
  Key,
  SlidersHorizontal,
  Sparkles,
  Swords,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { NotificationItem, SceneUser } from '../types';
import { playUiSound } from '../lib/audioEngine';
import { OnlineBlueTick } from './OnlineBlueTick';
import { VibePlayer } from './VibePlayer';

interface HeaderProps {
  currentUser: SceneUser | null;
  onlineCount: number;
  onlineUserIds: string[];
  notifications: NotificationItem[];
  onOpenOnboarding: () => void;
  onOpenRestore: () => void;
  onOpenSpeedDate?: () => void;
  onAcceptChessInvite: (notif: NotificationItem) => void;
  onRespondFriendRequest: (notif: NotificationItem, action: 'accept' | 'decline') => void;
  onMarkNotificationsRead: (notificationId?: string) => void;
  onGoHome?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onlineCount,
  onlineUserIds,
  notifications,
  onOpenOnboarding,
  onOpenRestore,
  onOpenSpeedDate,
  onAcceptChessInvite,
  onRespondFriendRequest,
  onMarkNotificationsRead,
  onGoHome,
}) => {
  const [copiedKey, setCopiedKey] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleCopyKey = () => {
    if (!currentUser?.scene_key) return;
    navigator.clipboard?.writeText(currentUser.scene_key).catch(() => {});
    setCopiedKey(true);
    playUiSound('pop');
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#070709]/90 backdrop-blur-md border-b border-white/10 px-3 sm:px-4 lg:px-8 py-2.5 sm:py-3 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
        {/* Brand Logo & Live Online Pill */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              playUiSound('click');
              onGoHome?.();
            }}
            className="relative group cursor-pointer flex items-center gap-1.5 sm:gap-2 text-left"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#111116] border-2 border-[#CCFF00] flex items-center justify-center shadow-neo-sm group-hover:scale-105 transition-transform flex-shrink-0">
              <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-[#CCFF00]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-black text-base sm:text-xl lg:text-2xl tracking-tight text-white whitespace-nowrap">
                  Chess<span className="text-[#CCFF00]">Chat</span>
                </span>
                <span className="hidden xl:inline-block text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 whitespace-nowrap">
                  Live Video
                </span>
              </div>
              <span className="hidden lg:block text-[11px] font-mono text-white/50 whitespace-nowrap">
                chesschat.tools4genz.com
              </span>
            </div>
          </button>

          {/* Online Players Counter */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#111116] border border-white/10 text-xs font-mono whitespace-nowrap">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1D9BF0] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1D9BF0]"></span>
            </span>
            <Users className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span className="text-white/80">
              <strong className="text-white font-bold">{onlineCount}</strong>{' '}
              {onlineCount === 1 ? 'Player Online' : 'Players Online'}
            </span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
          {onOpenSpeedDate && (
            <button
              onClick={() => {
                playUiSound('pop');
                onOpenSpeedDate();
              }}
              className="hidden md:flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-500/15 to-[#CCFF00]/15 border border-pink-500/30 hover:border-[#CCFF00] text-xs font-heading font-black text-pink-300 hover:text-white transition-all shadow-sm whitespace-nowrap flex-shrink-0"
              title="3-Min Voice Blind Date (Free)"
            >
              <Heart className="w-3.5 h-3.5 fill-pink-500 text-pink-500 flex-shrink-0" />
              <span className="hidden lg:inline">Voice Date</span>
              <span className="lg:hidden">Date</span>
            </button>
          )}

          {/* Chill Vibe Music Player */}
          <VibePlayer />

          {currentUser ? (
            <>
              {/* Real-Time Notifications Bell */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  aria-label="Notifications"
                  onClick={() => {
                    playUiSound('click');
                    const next = !notifOpen;
                    setNotifOpen(next);
                  }}
                  className="relative p-2 rounded-lg bg-[#111116] border border-white/15 hover:border-cyan-400 text-white/80 hover:text-white transition-all flex-shrink-0"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-mono font-black flex items-center justify-center border border-[#070709] animate-pulse">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-14 sm:top-12 w-auto sm:w-88 md:w-96 max-h-[75vh] overflow-y-auto bg-[#111116] border-2 border-cyan-400/60 rounded-2xl shadow-neo p-3 z-50 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="font-heading font-black text-sm text-white flex items-center gap-1.5">
                        <Bell className="w-4 h-4 text-cyan-300" />
                        Notifications ({unreadCount} new)
                      </span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={() => onMarkNotificationsRead()}
                          className="text-[11px] font-mono text-[#CCFF00] hover:underline"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    {notifications.length === 0 ? (
                      <p className="text-xs font-mono text-white/45 text-center py-6">
                        No challenges or friend requests yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {notifications.map((notif) => {
                          const fromOnline = onlineUserIds.includes(notif.from_user_id);
                          return (
                            <div
                              key={notif.id}
                              className={`p-2.5 rounded-xl border transition-all space-y-2 ${
                                notif.is_read
                                  ? 'bg-[#070709]/60 border-white/10'
                                  : 'bg-cyan-500/10 border-cyan-400/40'
                              }`}
                            >
                              <div className="flex items-start gap-2.5">
                                <div
                                  className={`w-8 h-8 rounded-full bg-gradient-to-tr ${
                                    notif.from_avatar?.bg || 'from-violet-600 to-indigo-900'
                                  } flex items-center justify-center text-sm flex-shrink-0`}
                                >
                                  {notif.from_avatar?.emoji || '♟️'}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-heading font-bold text-white truncate">
                                      {notif.title}
                                    </span>
                                    <OnlineBlueTick isOnline={fromOnline} size="xs" />
                                  </div>
                                  <p className="text-[11px] text-white/65 leading-snug mt-0.5">
                                    {notif.body}
                                  </p>
                                </div>
                              </div>

                              {notif.type === 'chess_invite' && notif.payload?.gameId && (
                                <div className="flex items-center gap-2 pl-10">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setNotifOpen(false);
                                      onAcceptChessInvite(notif);
                                    }}
                                    className="px-3 py-1 rounded-lg bg-[#CCFF00] text-black text-[11px] font-heading font-black flex items-center gap-1"
                                  >
                                    <Swords className="w-3 h-3" />
                                    Accept &amp; Play
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onMarkNotificationsRead(notif.id)}
                                    className="px-2.5 py-1 rounded-lg bg-white/5 text-white/60 text-[11px] font-mono"
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              )}

                              {notif.type === 'friend_request' && !notif.is_read && (
                                <div className="flex items-center gap-2 pl-10">
                                  <button
                                    type="button"
                                    onClick={() => onRespondFriendRequest(notif, 'accept')}
                                    className="px-3 py-1 rounded-lg bg-[#1D9BF0] text-white text-[11px] font-heading font-bold flex items-center gap-1"
                                  >
                                    <UserPlus className="w-3 h-3" />
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onRespondFriendRequest(notif, 'decline')}
                                    className="px-2.5 py-1 rounded-lg bg-white/5 text-white/60 text-[11px] font-mono flex items-center gap-1"
                                  >
                                    <X className="w-3 h-3" />
                                    Decline
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Scene Key Backup Pill */}
              <button
                onClick={handleCopyKey}
                title="Click to copy your recovery Key"
                className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#111116] border border-white/10 hover:border-[#CCFF00] text-xs font-mono transition-all group whitespace-nowrap"
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

              {/* Player Profile Pill with @username + Online Blue Tick */}
              <div
                onClick={() => {
                  playUiSound('click');
                  onOpenOnboarding();
                }}
                className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-[#111116] border border-white/15 hover:border-[#CCFF00] cursor-pointer transition-all min-w-0 max-w-[140px] sm:max-w-[200px] md:max-w-none flex-shrink-0"
              >
                <div
                  className={`w-7 h-7 rounded-full bg-gradient-to-tr ${currentUser.avatar.bg} flex items-center justify-center text-sm shadow-sm flex-shrink-0`}
                >
                  {currentUser.avatar.emoji}
                </div>
                <div className="flex flex-col text-left min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-heading font-bold text-white leading-tight truncate">
                      {currentUser.alias}
                    </span>
                    <OnlineBlueTick isOnline={true} size="xs" />
                  </div>
                  <span className="text-[10px] font-mono text-cyan-300 leading-tight truncate">
                    @{currentUser.username || currentUser.alias.toLowerCase()}
                  </span>
                </div>
                <SlidersHorizontal className="w-3 h-3 text-white/40 ml-0.5 flex-shrink-0 hidden md:block" />
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  playUiSound('click');
                  onOpenRestore();
                }}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#111116] border border-white/15 hover:border-violet-500 text-xs font-mono text-white/80 hover:text-white transition-all whitespace-nowrap flex-shrink-0"
              >
                <Key className="w-3.5 h-3.5 text-violet-400" />
                <span className="hidden sm:inline">Restore Account</span>
                <span className="sm:hidden">Restore</span>
              </button>

              <button
                onClick={() => {
                  playUiSound('click');
                  onOpenOnboarding();
                }}
                className="neo-btn-lime px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold tracking-wide flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 fill-black flex-shrink-0" />
                <span>Create Profile</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
