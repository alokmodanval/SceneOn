import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { LiveVoiceRooms } from './components/LiveVoiceRooms';
import { SceneBoard } from './components/SceneBoard';
import { OnboardingModal } from './components/OnboardingModal';
import { RestoreSceneModal } from './components/RestoreSceneModal';
import { StoryCardModal } from './components/StoryCardModal';
import { HostRoomModal } from './components/HostRoomModal';
import { OneOnOneChatModal } from './components/OneOnOneChatModal';
import { VoiceRoomActive } from './components/VoiceRoomActive';
import { ViralMatchBanner } from './components/ViralMatchBanner';
import { SpeedDateModal } from './components/SpeedDateModal';
import { ChessArena, ExternalChallengeRequest } from './components/ChessArena';
import {
  ChessHistoryRecord,
  FriendsDataPayload,
  NotificationItem,
  SceneRoom,
  SceneUser,
} from './types';
import {
  clearCurrentUser,
  getCurrentUser,
  isFreshWithin24Hours,
  saveCurrentUser,
} from './lib/identity';
import {
  fetchChessHistory,
  fetchFriendsData,
  fetchNotifications,
  fetchSceneRooms,
  fetchSceneUsers,
  getSceneUserById,
  isSupabaseConfigured,
  markNotificationsRead,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
  upsertSceneRoom,
  upsertSceneUser,
} from './lib/supabase';
import { lobbySocket } from './lib/lobbySocket';
import { buildApiUrl } from './lib/backendConfig';
import { playChessSound } from './lib/chessHelpers';
import { playUiSound } from './lib/audioEngine';
import { Crown, Heart, Radio, Share2, Sparkles, Swords, X } from 'lucide-react';

export function App() {
  const [currentUser, setCurrentUser] = useState<SceneUser | null>(() => getCurrentUser());
  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Default Landing Tab = ChessChat Arena (first page opens directly onto the Chessboard + Signup/Friends)
  const [activeTab, setActiveTab] = useState<'chess' | 'voice'>('chess');
  const [voiceSubTab, setVoiceSubTab] = useState<'rooms' | 'people'>('rooms');
  const [isChessGameActive, setIsChessGameActive] = useState<boolean>(false);
  const [rooms, setRooms] = useState<SceneRoom[]>([]);
  const [peers, setPeers] = useState<SceneUser[]>([]);
  const [activeRoom, setActiveRoom] = useState<SceneRoom | null>(null);
  const [chatTargetUser, setChatTargetUser] = useState<SceneUser | null>(null);

  const [initialChessGameId, setInitialChessGameId] = useState<string | null>(null);
  const [initialChessTimeMs, setInitialChessTimeMs] = useState<number>(300000);
  const [externalChallengeRequest, setExternalChallengeRequest] =
    useState<ExternalChallengeRequest | null>(null);

  const [lobbyOnlineCount, setLobbyOnlineCount] = useState<number>(0);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [isD1Connected, setIsD1Connected] = useState<boolean>(false);

  // Friends, Match History & Live Notifications State
  const [friendsData, setFriendsData] = useState<FriendsDataPayload>({
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
  });
  const [chessHistory, setChessHistory] = useState<ChessHistoryRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [liveToast, setLiveToast] = useState<NotificationItem | null>(null);

  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);
  const [isStoryCardOpen, setIsStoryCardOpen] = useState(false);
  const [isHostModalOpen, setIsHostModalOpen] = useState(false);
  const [isSpeedDateOpen, setIsSpeedDateOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    'speed_date' | 'host_room' | 'chess_invite' | null
  >(null);
  const [inviterUser, setInviterUser] = useState<SceneUser | null>(null);

  const refreshSocialData = useCallback(async () => {
    const uid = currentUserRef.current?.id;
    if (!uid) {
      const localHist = await fetchChessHistory('');
      setChessHistory(localHist);
      return;
    }
    const [friends, notifs, hist] = await Promise.all([
      fetchFriendsData(uid),
      fetchNotifications(uid),
      fetchChessHistory(uid),
    ]);
    setFriendsData(friends);
    setNotifications(notifs);
    setChessHistory(hist);
  }, []);

  const loadData = useCallback(
    async (checkDeepLinks = false) => {
      const [fetchedRooms, fetchedUsers] = await Promise.all([
        fetchSceneRooms(currentUserRef.current?.id),
        fetchSceneUsers(),
      ]);
      setRooms(fetchedRooms);
      setPeers(fetchedUsers);
      await refreshSocialData();

      if (!checkDeepLinks) return;

      const params = new URLSearchParams(window.location.search);
      const chessParam = params.get('chess');
      if (chessParam) {
        const tc = Number(params.get('tc')) || 300000;
        setInitialChessGameId(chessParam);
        setInitialChessTimeMs(tc);
        setActiveTab('chess');
      }

      const matchUserId = params.get('match');
      if (matchUserId) {
        const found = fetchedUsers.find(
          (u) => u.id === matchUserId || u.id.startsWith(matchUserId)
        );
        if (found) {
          setInviterUser(found);
        } else {
          getSceneUserById(matchUserId).then((u) => {
            if (u) setInviterUser(u);
          });
        }
      }

      const targetRoomId = params.get('room');
      if (targetRoomId) {
        let targetRoom = fetchedRooms.find((r) => r.id === targetRoomId);
        const pinParam = params.get('pin');
        if (!targetRoom) {
          targetRoom = {
            id: targetRoomId,
            title: '🎙️ Live Voice Pod',
            vibe_tag: '☕ Chai & Bakchodi',
            participants: [],
            max_users: 6,
            active_topic: 'Aaj ka scene kya hai? Hop on mic!',
            kick_votes: {},
            created_at: new Date().toISOString(),
            is_private: Boolean(pinParam),
            room_pin: pinParam || undefined,
          };
          setRooms((prev) => [targetRoom!, ...prev]);
        }

        if (!targetRoom.is_private || targetRoom.room_pin === pinParam) {
          setActiveTab('voice');
          setActiveRoom(targetRoom);
          if (!getCurrentUser()) {
            setIsOnboardingOpen(true);
          }
        } else {
          setActiveTab('voice');
        }
      }
    },
    [refreshSocialData]
  );

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadData(true);
    });

    const handleAuthChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && 'user' in detail) {
        setCurrentUser(detail.user);
      }
    };

    const handleDataSync = () => {
      void loadData(false);
    };

    const handleOpenStoryCard = () => {
      setIsStoryCardOpen(true);
    };

    window.addEventListener('sceneon-auth-change', handleAuthChange);
    window.addEventListener('sceneon-sync', handleDataSync);
    window.addEventListener('sceneon-open-storycard', handleOpenStoryCard);

    return () => {
      active = false;
      window.removeEventListener('sceneon-auth-change', handleAuthChange);
      window.removeEventListener('sceneon-sync', handleDataSync);
      window.removeEventListener('sceneon-open-storycard', handleOpenStoryCard);
    };
  }, [loadData]);

  // Connect Cloudflare Durable Object LobbyHub for real-time presence, online blue ticks & live notifications
  useEffect(() => {
    fetch(buildApiUrl('/api/health'))
      .then((res) =>
        res.ok && (res.headers.get('content-type') || '').includes('json') ? res.json() : null
      )
      .then((data: { ok?: boolean } | null) => {
        if (data?.ok) setIsD1Connected(true);
      })
      .catch(() => {});

    const presenceId = currentUser?.id || `guest_${Math.random().toString(36).slice(2, 8)}`;
    const presenceAlias = currentUser?.alias || 'ChessGuest';
    lobbySocket.connect(presenceId, presenceAlias);

    const unsub = lobbySocket.subscribe((event) => {
      if (event.type === 'presence_update' || event.type === 'pong') {
        if (typeof event.onlineCount === 'number') setLobbyOnlineCount(event.onlineCount);
        if (Array.isArray(event.onlineUserIds)) setOnlineUserIds(event.onlineUserIds);
        setIsD1Connected(true);
      }
      if (event.type === 'notification') {
        playChessSound('notify');
        setNotifications((prev) =>
          prev.some((n) => n.id === event.notification.id)
            ? prev
            : [event.notification, ...prev]
        );
        setLiveToast(event.notification);
        window.setTimeout(() => {
          setLiveToast((curr) => (curr?.id === event.notification.id ? null : curr));
        }, 12000);
        void refreshSocialData();
      }
      if (event.type === 'friends_updated' || event.type === 'history_updated') {
        void refreshSocialData();
      }
    });

    return () => {
      unsub();
    };
  }, [currentUser?.id, currentUser?.alias, refreshSocialData]);

  // Update online presence quietly every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      const user = currentUserRef.current;
      if (!user) return;
      const updated = { ...user, last_seen: new Date().toISOString() };
      localStorage.setItem('sceneon_current_user', JSON.stringify(updated));
      upsertSceneUser(updated).catch(console.error);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleJoinRoom = (room: SceneRoom) => {
    const user = currentUserRef.current;
    if (!user) {
      setIsOnboardingOpen(true);
      return;
    }

    const exists = room.participants.some((p) => p.id === user.id);
    if (!exists) {
      const isHost = room.host_id === user.id || room.participants.length === 0;
      const openSeat =
        [1, 2, 3, 4, 5, 6].find(
          (s) =>
            !(room.locked_seats || []).includes(s) &&
            !room.participants.some((p) => (p.seat_number || 1) === s)
        ) || 2;
      const role: 'host' | 'speaker' | 'listener' = isHost
        ? 'host'
        : room.participants.length < 6
        ? 'speaker'
        : 'listener';

      const updatedRoom: SceneRoom = {
        ...room,
        participants: [
          ...room.participants,
          {
            id: user.id,
            alias: user.alias,
            avatar: user.avatar,
            is_muted: true,
            is_speaking: false,
            voice_filter: 'natural',
            role,
            seat_number: role !== 'listener' ? (isHost ? 1 : openSeat) : undefined,
            joined_at: new Date().toISOString(),
          },
        ],
      };
      upsertSceneRoom(updatedRoom).catch(console.error);
      setRooms((prev) => prev.map((r) => (r.id === updatedRoom.id ? updatedRoom : r)));
      setActiveRoom(updatedRoom);
    } else {
      setActiveRoom(room);
    }
  };

  const handleLeaveActiveRoom = () => {
    const user = currentUserRef.current;
    if (activeRoom && user) {
      const cleanedRoom: SceneRoom = {
        ...activeRoom,
        participants: (activeRoom.participants || []).filter((p) => p.id !== user.id),
      };
      upsertSceneRoom(cleanedRoom).catch(console.error);
      setRooms((prev) => prev.map((r) => (r.id === cleanedRoom.id ? cleanedRoom : r)));
    }
    setActiveRoom(null);
  };

  // Friend & Notification Handlers
  const handleSendFriendRequestAction = async (target: {
    toUserId?: string;
    toUsername?: string;
  }): Promise<string> => {
    if (!currentUser) {
      setIsOnboardingOpen(true);
      return 'Create a profile first to send friend requests!';
    }
    const res = await sendFriendRequest({
      fromUserId: currentUser.id,
      toUserId: target.toUserId,
      toUsername: target.toUsername,
    });
    await refreshSocialData();
    if (res.alreadyFriends) return 'You are already ChessChat friends!';
    if (res.ok && res.status === 'accepted') return 'Friend request accepted!';
    if (res.ok) return 'Friend request notification sent!';
    return res.error || 'Could not send friend request.';
  };

  const handleRespondFriendRequestAction = async (
    requesterId: string,
    action: 'accept' | 'decline'
  ) => {
    if (!currentUser) return;
    await respondToFriendRequest(currentUser.id, requesterId, action);
    await refreshSocialData();
  };

  const handleRemoveFriendAction = async (friendId: string) => {
    if (!currentUser) return;
    await removeFriend(currentUser.id, friendId);
    await refreshSocialData();
  };

  const handleAcceptChessInvite = (notif: NotificationItem) => {
    if (!currentUser || !notif.payload?.gameId) return;
    playUiSound('unlock');
    setLiveToast(null);
    void markNotificationsRead(currentUser.id, notif.id).then(() => refreshSocialData());
    setActiveTab('chess');
    setActiveRoom(null);
    setExternalChallengeRequest({
      launchKey: `${notif.id}_${Date.now()}`,
      gameId: notif.payload.gameId,
      timeControlMs: notif.payload.timeControlMs || 300000,
      preferredColor: 'b',
      opponent: {
        id: notif.from_user_id,
        alias: notif.from_alias,
        username: notif.from_username,
        avatar: notif.from_avatar,
      },
    });
  };

  const activePeersCount = peers.filter(
    (p) => p.is_online && isFreshWithin24Hours(p.last_seen)
  ).length;
  const onlineCount = Math.max(activePeersCount + (currentUser ? 1 : 0), lobbyOnlineCount);

  return (
    <div className="min-h-screen bg-[#070709] text-white flex flex-col font-body selection:bg-[#CCFF00] selection:text-black">
      {inviterUser && (
        <ViralMatchBanner
          inviterUser={inviterUser}
          currentUser={currentUser}
          onOpenChat={(user) => setChatTargetUser(user)}
          onOpenOnboarding={() => setIsOnboardingOpen(true)}
        />
      )}

      <Header
        currentUser={currentUser}
        onlineCount={onlineCount}
        onlineUserIds={onlineUserIds}
        notifications={notifications}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onOpenRestore={() => setIsRestoreOpen(true)}
        onOpenSpeedDate={() => {
          if (!currentUser) {
            setPendingAction('speed_date');
            setIsOnboardingOpen(true);
          } else {
            setIsSpeedDateOpen(true);
          }
        }}
        onAcceptChessInvite={handleAcceptChessInvite}
        onRespondFriendRequest={(notif, action) => {
          const reqId = notif.payload?.requesterId || notif.from_user_id;
          void handleRespondFriendRequestAction(reqId, action);
        }}
        onMarkNotificationsRead={(id) => {
          if (!currentUser) return;
          void markNotificationsRead(currentUser.id, id).then(() => refreshSocialData());
        }}
        onGoHome={() => {
          setActiveRoom(null);
          setActiveTab('chess');
        }}
      />

      {/* Live Incoming Challenge / Friend Request Floating Toast */}
      {liveToast && (
        <div className="fixed top-16 right-3 sm:right-6 z-50 w-[calc(100%-24px)] sm:w-88 bg-[#111116] border-2 border-[#CCFF00] rounded-2xl p-3.5 shadow-neo animate-fadeIn space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`w-9 h-9 rounded-full bg-gradient-to-tr ${
                  liveToast.from_avatar?.bg || 'from-violet-600 to-indigo-900'
                } flex items-center justify-center text-base flex-shrink-0`}
              >
                {liveToast.from_avatar?.emoji || '♟️'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-heading font-black text-white truncate">
                  {liveToast.title}
                </p>
                <p className="text-[11px] text-white/70 leading-snug">{liveToast.body}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLiveToast(null)}
              aria-label="Close notification popup"
              className="p-1 rounded-lg text-white/50 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {liveToast.type === 'chess_invite' && liveToast.payload?.gameId && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAcceptChessInvite(liveToast)}
                className="flex-1 py-2 px-3 rounded-xl bg-[#CCFF00] text-black font-heading font-black text-xs flex items-center justify-center gap-1.5"
              >
                <Swords className="w-3.5 h-3.5" />
                <span>Accept &amp; Play (Camera Check)</span>
              </button>
            </div>
          )}

          {liveToast.type === 'friend_request' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const reqId = liveToast.payload?.requesterId || liveToast.from_user_id;
                  setLiveToast(null);
                  void handleRespondFriendRequestAction(reqId, 'accept');
                }}
                className="flex-1 py-1.5 rounded-xl bg-[#1D9BF0] text-white font-heading font-bold text-xs"
              >
                Accept Friend
              </button>
              <button
                type="button"
                onClick={() => setLiveToast(null)}
                className="px-3 py-1.5 rounded-xl bg-white/5 text-white/70 text-xs font-mono"
              >
                Later
              </button>
            </div>
          )}
        </div>
      )}

      <main className={isChessGameActive ? '' : 'flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 pb-28 sm:pb-12'}>
        {activeRoom && currentUser ? (
          <VoiceRoomActive
            room={activeRoom}
            currentUser={currentUser}
            onLeaveRoom={handleLeaveActiveRoom}
            onUpdateRoom={(updated) => {
              setActiveRoom(updated);
              setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
              upsertSceneRoom(updated).catch(console.error);
            }}
          />
        ) : (
          <>
            {/* Streamlined 2-Pillar Navigation (hidden during fullscreen zero-scroll chess match) */}
            {!isChessGameActive && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 mb-5">
                <div className="grid grid-cols-2 sm:flex items-center w-full lg:w-auto gap-1 sm:gap-2">
                  <button
                    onClick={() => {
                      playUiSound('click');
                      setActiveTab('chess');
                    }}
                    className={`px-2 sm:px-5 py-3 font-heading font-black text-xs sm:text-sm lg:text-base flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 border-b-2 transition-all whitespace-nowrap ${
                      activeTab === 'chess'
                        ? 'border-[#CCFF00] text-[#CCFF00]'
                        : 'border-transparent text-white/50 hover:text-white'
                    }`}
                  >
                    <Crown className="w-4 h-4 flex-shrink-0" />
                    <span>Chess + Video Call</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">
                      LIVE
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      playUiSound('click');
                      setActiveTab('voice');
                    }}
                    className={`px-2 sm:px-5 py-3 font-heading font-black text-xs sm:text-sm lg:text-base flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 border-b-2 transition-all whitespace-nowrap ${
                      activeTab === 'voice'
                        ? 'border-[#CCFF00] text-[#CCFF00]'
                        : 'border-transparent text-white/50 hover:text-white'
                    }`}
                  >
                    <Radio className="w-4 h-4 flex-shrink-0" />
                    <span>Voice Date &amp; Connect</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300">
                      FREE
                    </span>
                  </button>
                </div>

                <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-white/40 flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#CCFF00]" />
                  <span>
                    {isD1Connected
                      ? 'Cloudflare D1 + DO Live'
                      : isSupabaseConfigured
                      ? 'Supabase Realtime Live'
                      : 'P2P Local Mode'}
                  </span>
                </div>
              </div>
            )}

            {activeTab === 'chess' ? (
              <ChessArena
                key={initialChessGameId || 'chess'}
                currentUser={currentUser}
                onlineUserIds={onlineUserIds}
                friendsData={friendsData}
                history={chessHistory}
                initialGameId={initialChessGameId}
                initialTimeControlMs={initialChessTimeMs}
                externalChallengeRequest={externalChallengeRequest}
                onClearExternalChallenge={() => setExternalChallengeRequest(null)}
                onClearInitialGame={() => setInitialChessGameId(null)}
                onQuickUserCreated={(u) => {
                  setCurrentUser(u);
                  void refreshSocialData();
                }}
                onOpenRestore={() => setIsRestoreOpen(true)}
                onSignOut={() => {
                  clearCurrentUser();
                  lobbySocket.disconnect();
                  setCurrentUser(null);
                  setFriendsData({ friends: [], incomingRequests: [], outgoingRequests: [] });
                  setNotifications([]);
                }}
                onSendFriendRequest={handleSendFriendRequestAction}
                onRespondFriendRequest={handleRespondFriendRequestAction}
                onRemoveFriend={handleRemoveFriendAction}
                onOpenChat={(u) => setChatTargetUser(u)}
                onRefreshSocialData={refreshSocialData}
                onGameActiveChange={setIsChessGameActive}
              />
            ) : (
              <div className="space-y-6 animate-fadeIn">
                {/* Unified Voice Dating + Connect Hub */}
                <div className="bg-gradient-to-r from-pink-500/15 via-[#111116] to-[#CCFF00]/15 border-2 border-pink-500/40 rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <span className="text-[11px] font-mono font-bold text-pink-300 uppercase">
                      ⚡ Voice Dating &amp; Social Connect
                    </span>
                    <h2 className="text-xl sm:text-2xl font-heading font-black text-white">
                      Talk Over Anonymous Voice Before Sharing Identity
                    </h2>
                    <p className="text-xs sm:text-sm text-white/70">
                      Try 3-Minute Blind Voice Date, hop into open voice rooms, or connect directly with online people.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playUiSound('pop');
                      if (!currentUser) {
                        setPendingAction('speed_date');
                        setIsOnboardingOpen(true);
                      } else {
                        setIsSpeedDateOpen(true);
                      }
                    }}
                    className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#CCFF00] via-[#00F0FF] to-[#FF2E93] text-black font-heading font-black text-sm shadow-neo border-2 border-black flex items-center justify-center gap-2 flex-shrink-0"
                  >
                    <Heart className="w-4 h-4 fill-black" />
                    <span>Start 3-Min Voice Date</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVoiceSubTab('rooms')}
                    className={`px-4 py-2 rounded-xl font-heading font-bold text-xs border transition-all ${
                      voiceSubTab === 'rooms'
                        ? 'bg-[#CCFF00] text-black border-[#CCFF00]'
                        : 'bg-[#111116] text-white/70 border-white/15'
                    }`}
                  >
                    🎙️ Voice Rooms ({rooms.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoiceSubTab('people')}
                    className={`px-4 py-2 rounded-xl font-heading font-bold text-xs border transition-all ${
                      voiceSubTab === 'people'
                        ? 'bg-violet-500 text-white border-violet-400'
                        : 'bg-[#111116] text-white/70 border-white/15'
                    }`}
                  >
                    ✨ People Online ({peers.length})
                  </button>
                </div>

                {voiceSubTab === 'rooms' ? (
                  <LiveVoiceRooms
                    rooms={rooms}
                    currentUser={currentUser}
                    onJoinRoom={handleJoinRoom}
                    onOpenHostModal={() => setIsHostModalOpen(true)}
                    onOpenOnboarding={() => {
                      setPendingAction('host_room');
                      setIsOnboardingOpen(true);
                    }}
                  />
                ) : (
                  <SceneBoard
                    peers={peers}
                    currentUser={currentUser}
                    onOpenChat={(peer) => setChatTargetUser(peer)}
                    onOpenOnboarding={() => setIsOnboardingOpen(true)}
                  />
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Bar Navigation (hidden inside active Voice Room OR active Fullscreen Chess Game) */}
      {!(activeRoom && currentUser) && !isChessGameActive && (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#070709]/95 backdrop-blur-lg border-t border-white/10 px-3 py-2 flex items-center justify-around">
          <button
            onClick={() => {
              playUiSound('click');
              setActiveTab('chess');
            }}
            className={`flex flex-col items-center gap-0.5 text-[10px] font-mono ${
              activeTab === 'chess' ? 'text-[#CCFF00] font-bold' : 'text-white/60'
            }`}
          >
            <Crown className="w-4 h-4" />
            <span>Chess</span>
          </button>

          <button
            onClick={() => {
              playUiSound('click');
              setActiveTab('voice');
            }}
            className={`flex flex-col items-center gap-0.5 text-[10px] font-mono ${
              activeTab === 'voice' ? 'text-[#CCFF00] font-bold' : 'text-white/60'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Voice</span>
          </button>

          <button
            onClick={() => {
              playUiSound('pop');
              if (!currentUser) {
                setPendingAction('speed_date');
                setIsOnboardingOpen(true);
              } else {
                setIsSpeedDateOpen(true);
              }
            }}
            className="flex flex-col items-center gap-0.5 text-[10px] font-mono text-pink-300 font-bold"
          >
            <Heart className="w-4 h-4 fill-pink-500" />
            <span>Voice Date</span>
          </button>

          {currentUser ? (
            <button
              onClick={() => {
                playUiSound('click');
                setIsStoryCardOpen(true);
              }}
              className="flex flex-col items-center gap-0.5 text-[10px] font-mono text-white/60 hover:text-white"
            >
              <Share2 className="w-4 h-4 text-[#FF2E93]" />
              <span>Card</span>
            </button>
          ) : (
            <button
              onClick={() => {
                playUiSound('click');
                setIsOnboardingOpen(true);
              }}
              className="flex flex-col items-center gap-0.5 text-[10px] font-mono text-[#CCFF00] font-bold"
            >
              <Sparkles className="w-4 h-4 fill-[#CCFF00]" />
              <span>Join</span>
            </button>
          )}
        </nav>
      )}

      {/* Production Footer (hidden during fullscreen chess) */}
      {!isChessGameActive && (
        <footer className="border-t border-white/10 bg-[#070709] pt-8 pb-24 sm:pb-8 text-center text-xs font-mono text-white/50">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p className="text-white/80 font-bold">
            ChessChat by{' '}
            <a
              href="https://tools4genz.com"
              target="_blank"
              rel="noreferrer"
              className="text-[#CCFF00] hover:underline"
            >
              Tools4Genz
            </a>{' '}
            • chesschat.tools4genz.com
          </p>
          <p className="text-white/40">
            100% Free Forever • Zero-Login Live Chess • HD WebRTC Voice &amp; Video • Friends &amp; Match History
          </p>
        </div>
      </footer>
      )}

      {isOnboardingOpen && (
        <OnboardingModal
          isOpen={isOnboardingOpen}
          onClose={() => {
            setIsOnboardingOpen(false);
            setPendingAction(null);
          }}
          currentUser={currentUser}
          onUserSaved={(user) => {
            setCurrentUser(user);
            saveCurrentUser(user);
            setIsOnboardingOpen(false);
            void refreshSocialData();
            if (pendingAction === 'speed_date') {
              setPendingAction(null);
              setIsSpeedDateOpen(true);
            } else if (pendingAction === 'host_room') {
              setPendingAction(null);
              setIsHostModalOpen(true);
            } else if (pendingAction === 'chess_invite') {
              setPendingAction(null);
              setActiveTab('chess');
            }
          }}
        />
      )}

      {isRestoreOpen && (
        <RestoreSceneModal
          isOpen={isRestoreOpen}
          onClose={() => setIsRestoreOpen(false)}
          onUserRestored={(user) => {
            setCurrentUser(user);
            setIsRestoreOpen(false);
            void refreshSocialData();
          }}
        />
      )}

      {currentUser && isStoryCardOpen && (
        <StoryCardModal
          isOpen={isStoryCardOpen}
          onClose={() => setIsStoryCardOpen(false)}
          currentUser={currentUser}
        />
      )}

      {currentUser && isHostModalOpen && (
        <HostRoomModal
          isOpen={isHostModalOpen}
          onClose={() => setIsHostModalOpen(false)}
          currentUser={currentUser}
          onRoomCreated={(newRoom) => {
            setRooms((prev) => [newRoom, ...prev]);
            setActiveRoom(newRoom);
          }}
        />
      )}

      {currentUser && chatTargetUser && (
        <OneOnOneChatModal
          key={chatTargetUser.id}
          isOpen={Boolean(chatTargetUser)}
          onClose={() => setChatTargetUser(null)}
          currentUser={currentUser}
          targetUser={chatTargetUser}
        />
      )}

      {currentUser && isSpeedDateOpen && (
        <SpeedDateModal
          isOpen={isSpeedDateOpen}
          onClose={() => setIsSpeedDateOpen(false)}
          currentUser={currentUser}
          peers={peers}
          onOpenChat={(partner) => {
            setIsSpeedDateOpen(false);
            setChatTargetUser(partner);
          }}
        />
      )}
    </div>
  );
}

export default App;
