import React, { useEffect, useState } from 'react';
import {
  Header,
} from './components/Header';
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
import { SceneRoom, SceneUser } from './types';
import { getCurrentUser, isFreshWithin24Hours, saveCurrentUser } from './lib/identity';
import {
  fetchSceneRooms,
  fetchSceneUsers,
  getSceneUserById,
  isSupabaseConfigured,
  upsertSceneUser,
} from './lib/supabase';
import { Radio, Users, Sparkles, Share2, Key } from 'lucide-react';
import { playUiSound } from './lib/audioEngine';

export function App() {
  // Current logged in user via Zero-Login Scene Key
  const [currentUser, setCurrentUser] = useState<SceneUser | null>(() => getCurrentUser());

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'voice' | 'matches'>('voice');

  // Rooms and Peers
  const [rooms, setRooms] = useState<SceneRoom[]>([]);
  const [peers, setPeers] = useState<SceneUser[]>([]);

  // Active Voice Scene Room
  const [activeRoom, setActiveRoom] = useState<SceneRoom | null>(null);

  // Active 1-on-1 Chat target peer
  const [chatTargetUser, setChatTargetUser] = useState<SceneUser | null>(null);

  // Modals state
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);
  const [isStoryCardOpen, setIsStoryCardOpen] = useState(false);
  const [isHostModalOpen, setIsHostModalOpen] = useState(false);

  // Viral Invite state
  const [inviterUser, setInviterUser] = useState<SceneUser | null>(null);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      const [fetchedRooms, fetchedUsers] = await Promise.all([
        fetchSceneRooms(),
        fetchSceneUsers(),
      ]);
      setRooms(fetchedRooms);
      setPeers(fetchedUsers);

      // Check viral invite query param ?match=USER_ID
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
    }

    loadData();

    // Event listener for local reactive updates
    const handleAuthChange = (e: any) => {
      if (e.detail?.user) {
        setCurrentUser(e.detail.user);
      }
    };

    const handleDataSync = () => {
      loadData();
    };

    const handleOpenStoryCard = () => {
      setIsStoryCardOpen(true);
    };

    window.addEventListener('sceneon-auth-change', handleAuthChange);
    window.addEventListener('sceneon-sync', handleDataSync);
    window.addEventListener('sceneon-open-storycard', handleOpenStoryCard);

    return () => {
      window.removeEventListener('sceneon-auth-change', handleAuthChange);
      window.removeEventListener('sceneon-sync', handleDataSync);
      window.removeEventListener('sceneon-open-storycard', handleOpenStoryCard);
    };
  }, []);

  // Update online presence for current user
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(() => {
      const updated = { ...currentUser, last_seen: new Date().toISOString() };
      saveCurrentUser(updated);
      upsertSceneUser(updated).catch(console.error);
    }, 60000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Online count calculation (Real verified count)
  const activePeersCount = peers.filter((p) => p.is_online && isFreshWithin24Hours(p.last_seen)).length;
  const onlineCount = activePeersCount + (currentUser ? 1 : 0);

  return (
    <div className="min-h-screen bg-[#070709] text-white flex flex-col font-body selection:bg-[#CCFF00] selection:text-black">
      {/* Viral Match Banner if invited */}
      {inviterUser && (
        <ViralMatchBanner
          inviterUser={inviterUser}
          currentUser={currentUser}
          onOpenChat={(user) => setChatTargetUser(user)}
          onOpenOnboarding={() => setIsOnboardingOpen(true)}
        />
      )}

      {/* Header */}
      <Header
        currentUser={currentUser}
        onlineCount={onlineCount}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onOpenRestore={() => setIsRestoreOpen(true)}
        onOpenStoryCard={() => setIsStoryCardOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 sm:pb-12">
        {/* If inside an active voice room, present the room full-screen */}
        {activeRoom && currentUser ? (
          <VoiceRoomActive
            room={activeRoom}
            currentUser={currentUser}
            onLeaveRoom={() => setActiveRoom(null)}
            onUpdateRoom={(updated) => {
              setActiveRoom(updated);
              setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            }}
          />
        ) : (
          <>
            {/* Landing Hero */}
            <Hero
              currentUser={currentUser}
              onOpenOnboarding={() => setIsOnboardingOpen(true)}
              onSelectTab={(tab) => setActiveTab(tab)}
            />

            {/* Hybrid Discovery Tabs Navigation */}
            <div className="flex items-center justify-between border-b border-white/10 mb-8 pt-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    playUiSound('click');
                    setActiveTab('voice');
                  }}
                  className={`px-5 py-3 font-heading font-black text-sm sm:text-base flex items-center gap-2 border-b-2 transition-all ${
                    activeTab === 'voice'
                      ? 'border-[#CCFF00] text-[#CCFF00]'
                      : 'border-transparent text-white/50 hover:text-white'
                  }`}
                >
                  <Radio className="w-4 h-4" />
                  <span>🎙️ Live Voice Scenes</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[#CCFF00]/15 text-[#CCFF00] ml-1">
                    {rooms.length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    playUiSound('click');
                    setActiveTab('matches');
                  }}
                  className={`px-5 py-3 font-heading font-black text-sm sm:text-base flex items-center gap-2 border-b-2 transition-all ${
                    activeTab === 'matches'
                      ? 'border-[#CCFF00] text-[#CCFF00]'
                      : 'border-transparent text-white/50 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>⚡ Scene Matches</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 ml-1">
                    24h
                  </span>
                </button>
              </div>

              {/* Status Indicator */}
              <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-white/40">
                <span className="w-1.5 h-1.5 rounded-full bg-[#CCFF00]" />
                <span>{isSupabaseConfigured ? 'Supabase Realtime Live' : 'P2P Local Mode'}</span>
              </div>
            </div>

            {/* Tab Views */}
            {activeTab === 'voice' ? (
              <LiveVoiceRooms
                rooms={rooms}
                currentUser={currentUser}
                onJoinRoom={(room) => setActiveRoom(room)}
                onOpenHostModal={() => setIsHostModalOpen(true)}
                onOpenOnboarding={() => setIsOnboardingOpen(true)}
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

      {/* Mobile Bottom Bar Navigation */}
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

      {/* Production Footer */}
      <footer className="border-t border-white/10 bg-[#070709] py-8 text-center text-xs font-mono text-white/50">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p className="text-white/80 font-bold">
            SceneOn by <a href="https://tools4genz.com" target="_blank" rel="noreferrer" className="text-[#CCFF00] hover:underline">Tools4Genz</a> • Target Production: scene.tools4genz.com
          </p>
          <p className="text-white/40">
            100% Free Forever • Zero-Login Architecture • WebRTC Audio Mesh • Web Audio API Voice Filters
          </p>
        </div>
      </footer>

      {/* Modals & Overlays */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        currentUser={currentUser}
        onUserSaved={(user) => {
          setCurrentUser(user);
          setIsOnboardingOpen(false);
        }}
      />

      <RestoreSceneModal
        isOpen={isRestoreOpen}
        onClose={() => setIsRestoreOpen(false)}
        onUserRestored={(user) => {
          setCurrentUser(user);
          setIsRestoreOpen(false);
        }}
      />

      {currentUser && (
        <StoryCardModal
          isOpen={isStoryCardOpen}
          onClose={() => setIsStoryCardOpen(false)}
          currentUser={currentUser}
        />
      )}

      {currentUser && (
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
          isOpen={Boolean(chatTargetUser)}
          onClose={() => setChatTargetUser(null)}
          currentUser={currentUser}
          targetUser={chatTargetUser}
        />
      )}
    </div>
  );
}

export default App;
