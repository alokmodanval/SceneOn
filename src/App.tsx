import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
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
import { SceneRoom, SceneUser } from './types';
import { getCurrentUser, isFreshWithin24Hours, saveCurrentUser } from './lib/identity';
import {
  fetchSceneRooms,
  fetchSceneUsers,
  getSceneUserById,
  isSupabaseConfigured,
  upsertSceneRoom,
  upsertSceneUser,
} from './lib/supabase';
import { Radio, Sparkles, Share2, Heart } from 'lucide-react';
import { playUiSound } from './lib/audioEngine';

export function App() {
  const [currentUser, setCurrentUser] = useState<SceneUser | null>(() => getCurrentUser());
  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const [activeTab, setActiveTab] = useState<'voice' | 'matches'>('voice');
  const [rooms, setRooms] = useState<SceneRoom[]>([]);
  const [peers, setPeers] = useState<SceneUser[]>([]);
  const [activeRoom, setActiveRoom] = useState<SceneRoom | null>(null);
  const [chatTargetUser, setChatTargetUser] = useState<SceneUser | null>(null);

  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);
  const [isStoryCardOpen, setIsStoryCardOpen] = useState(false);
  const [isHostModalOpen, setIsHostModalOpen] = useState(false);
  const [isSpeedDateOpen, setIsSpeedDateOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'speed_date' | 'host_room' | null>(null);
  const [inviterUser, setInviterUser] = useState<SceneUser | null>(null);

  const loadData = useCallback(async (checkDeepLinks = false) => {
    const [fetchedRooms, fetchedUsers] = await Promise.all([
      fetchSceneRooms(),
      fetchSceneUsers(),
    ]);
    setRooms(fetchedRooms);
    setPeers(fetchedUsers);

    if (!checkDeepLinks) return;

    const params = new URLSearchParams(window.location.search);
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
        setActiveRoom(targetRoom);
        if (!getCurrentUser()) {
          setIsOnboardingOpen(true);
        }
      } else {
        setActiveTab('voice');
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadData(true);
    });

    const handleAuthChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.user) {
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

  // Update online presence quietly every 60s without causing modal re-renders
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

  const activePeersCount = peers.filter((p) => p.is_online && isFreshWithin24Hours(p.last_seen)).length;
  const onlineCount = activePeersCount + (currentUser ? 1 : 0);

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
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onOpenRestore={() => setIsRestoreOpen(true)}
        onOpenStoryCard={() => setIsStoryCardOpen(true)}
        onOpenSpeedDate={() => {
          if (!currentUser) {
            setPendingAction('speed_date');
            setIsOnboardingOpen(true);
          } else {
            setIsSpeedDateOpen(true);
          }
        }}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 sm:pb-12">
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
            <Hero
              currentUser={currentUser}
              onOpenOnboarding={() => setIsOnboardingOpen(true)}
              onSelectTab={(tab) => setActiveTab(tab)}
              onOpenSpeedDate={() => {
                if (!currentUser) {
                  setPendingAction('speed_date');
                  setIsOnboardingOpen(true);
                } else {
                  setIsSpeedDateOpen(true);
                }
              }}
            />

            <div className="flex items-center justify-between border-b border-white/10 mb-8 pt-4">
              <div className="grid grid-cols-2 sm:flex items-center w-full sm:w-auto gap-1 sm:gap-2">
                <button
                  onClick={() => {
                    playUiSound('click');
                    setActiveTab('voice');
                  }}
                  className={`px-2 sm:px-5 py-3 font-heading font-black text-xs sm:text-base flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 border-b-2 transition-all whitespace-nowrap ${
                    activeTab === 'voice'
                      ? 'border-[#CCFF00] text-[#CCFF00]'
                      : 'border-transparent text-white/50 hover:text-white'
                  }`}
                >
                  <Radio className="w-4 h-4 flex-shrink-0" />
                  <span className="sm:hidden">Voice Scenes</span>
                  <span className="hidden sm:inline">Live Voice Scenes</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[#CCFF00]/15 text-[#CCFF00]">
                    {rooms.length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    playUiSound('click');
                    setActiveTab('matches');
                  }}
                  className={`px-2 sm:px-5 py-3 font-heading font-black text-xs sm:text-base flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 border-b-2 transition-all whitespace-nowrap ${
                    activeTab === 'matches'
                      ? 'border-[#CCFF00] text-[#CCFF00]'
                      : 'border-transparent text-white/50 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-4 h-4 flex-shrink-0" />
                  <span>Scene Matches</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300">
                    24h
                  </span>
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-white/40 flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#CCFF00]" />
                <span>{isSupabaseConfigured ? 'Supabase Realtime Live' : 'P2P Local Mode'}</span>
              </div>
            </div>

            {activeTab === 'voice' ? (
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
          </>
        )}
      </main>

      {/* Mobile Bottom Bar Navigation (hidden inside active voice room so controls stay unobstructed) */}
      {!(activeRoom && currentUser) && (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#070709]/95 backdrop-blur-lg border-t border-white/10 px-4 py-2 flex items-center justify-around">
          <button
            onClick={() => {
              playUiSound('click');
              setActiveTab('voice');
            }}
            className={`flex flex-col items-center gap-1 text-[11px] font-mono ${
              activeTab === 'voice' ? 'text-[#CCFF00] font-bold' : 'text-white/60'
            }`}
          >
            <Radio className="w-5 h-5" />
            <span>Voice</span>
          </button>

          <button
            onClick={() => {
              playUiSound('click');
              setActiveTab('matches');
            }}
            className={`flex flex-col items-center gap-1 text-[11px] font-mono ${
              activeTab === 'matches' ? 'text-[#CCFF00] font-bold' : 'text-white/60'
            }`}
          >
            <Sparkles className="w-5 h-5" />
            <span>Matches</span>
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
            className="flex flex-col items-center gap-1 text-[11px] font-mono text-[#CCFF00] font-bold"
          >
            <Heart className="w-5 h-5 fill-[#CCFF00] animate-bounce" />
            <span>Blind Date</span>
          </button>

          {currentUser ? (
            <button
              onClick={() => {
                playUiSound('click');
                setIsStoryCardOpen(true);
              }}
              className="flex flex-col items-center gap-1 text-[11px] font-mono text-white/60 hover:text-white"
            >
              <Share2 className="w-5 h-5 text-[#FF2E93]" />
              <span>Story Card</span>
            </button>
          ) : (
            <button
              onClick={() => {
                playUiSound('click');
                setIsOnboardingOpen(true);
              }}
              className="flex flex-col items-center gap-1 text-[11px] font-mono text-[#CCFF00] font-bold"
            >
              <Sparkles className="w-5 h-5 fill-[#CCFF00]" />
              <span>Set Scene</span>
            </button>
          )}
        </nav>
      )}

      {/* Production Footer */}
      <footer className="border-t border-white/10 bg-[#070709] pt-8 pb-24 sm:pb-8 text-center text-xs font-mono text-white/50">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p className="text-white/80 font-bold">
            FriendsClub by{' '}
            <a
              href="https://tools4genz.com"
              target="_blank"
              rel="noreferrer"
              className="text-[#CCFF00] hover:underline"
            >
              Tools4Genz
            </a>{' '}
            • friendsclub.tools4genz.com
          </p>
          <p className="text-white/40">
            100% Free Forever • Zero-Login Architecture • WebRTC Audio Mesh • Web Audio API Voice Filters
          </p>
        </div>
      </footer>

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
            if (pendingAction === 'speed_date') {
              setPendingAction(null);
              setIsSpeedDateOpen(true);
            } else if (pendingAction === 'host_room') {
              setPendingAction(null);
              setIsHostModalOpen(true);
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
