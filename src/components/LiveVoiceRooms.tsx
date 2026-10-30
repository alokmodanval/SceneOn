import React from 'react';
import { Radio, Users, Plus, Sparkles, MessageCircle } from 'lucide-react';
import { SceneRoom, SceneUser } from '../types';
import { playUiSound } from '../lib/audioEngine';

interface LiveVoiceRoomsProps {
  rooms: SceneRoom[];
  currentUser: SceneUser | null;
  onJoinRoom: (room: SceneRoom) => void;
  onOpenHostModal: () => void;
  onOpenOnboarding: () => void;
}

export const LiveVoiceRooms: React.FC<LiveVoiceRoomsProps> = ({
  rooms,
  currentUser,
  onJoinRoom,
  onOpenHostModal,
  onOpenOnboarding,
}) => {
  const handleJoinClick = (room: SceneRoom) => {
    playUiSound('click');
    if (!currentUser) {
      onOpenOnboarding();
      return;
    }
    onJoinRoom(room);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner & Host CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#111116] border border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCFF00] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CCFF00]"></span>
            </span>
            <span className="text-xs font-mono font-bold text-[#CCFF00] uppercase tracking-wider">
              ZERO-COST P2P AUDIO TABLES
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-heading font-black text-white">
            Hop into a Live Voice Scene
          </h2>
          <p className="text-xs sm:text-sm text-white/60 mt-0.5">
            Max 6 per table. Safe auto-mute by default. Web Audio voice changer included.
          </p>
        </div>

        <button
          onClick={() => {
            playUiSound('click');
            if (!currentUser) {
              onOpenOnboarding();
            } else {
              onOpenHostModal();
            }
          }}
          className="neo-btn-lime px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 flex-shrink-0 shadow-neo-sm"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>+ Host a New Scene</span>
        </button>
      </div>

      {/* Rooms Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map((room) => {
          const count = room.participants?.length || 0;
          const isFull = count >= (room.max_users || 6);

          return (
            <div
              key={room.id}
              className="group relative flex flex-col justify-between p-5 rounded-2xl bg-[#111116] border border-white/10 hover:border-[#CCFF00]/50 transition-all duration-300 hover:shadow-neo-sm"
            >
              <div>
                {/* Header Tag & Occupancy */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/80">
                    {room.vibe_tag}
                  </span>
                  <div
                    className={`flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-full ${
                      count > 0
                        ? 'bg-[#CCFF00]/15 text-[#CCFF00]'
                        : 'bg-white/5 text-white/40'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>
                      {count}/{room.max_users || 6}
                    </span>
                  </div>
                </div>

                {/* Title */}
                <h3 className="font-heading font-bold text-lg text-white group-hover:text-[#CCFF00] transition-colors mb-2">
                  {room.title}
                </h3>

                {/* Topic preview */}
                <div className="p-3 rounded-xl bg-[#070709] border border-white/5 mb-4 text-left">
                  <span className="text-[10px] font-mono text-white/40 block mb-0.5">
                    ACTIVE TABLE TOPIC
                  </span>
                  <p className="text-xs text-white/80 line-clamp-2 italic">
                    &quot;{room.active_topic || 'Aaj ka scene kya hai?'}&quot;
                  </p>
                </div>

                {/* Avatars of active speakers or open mic indicator */}
                {count > 0 ? (
                  <div className="flex items-center gap-1.5 mb-4">
                    <span className="text-[10px] font-mono text-white/40 mr-1">
                      AT THE TABLE:
                    </span>
                    <div className="flex -space-x-2">
                      {room.participants.slice(0, 4).map((p) => (
                        <div
                          key={p.id}
                          title={p.alias}
                          className={`w-7 h-7 rounded-full bg-gradient-to-tr ${
                            p.avatar?.bg || 'from-violet-600 to-indigo-900'
                          } border-2 border-[#111116] flex items-center justify-center text-xs shadow-sm`}
                        >
                          {p.avatar?.emoji || '⚡'}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mb-4 text-[11px] font-mono text-white/40">
                    <span className="w-2 h-2 rounded-full bg-[#CCFF00]/60 inline-block" />
                    <span>Table open • Hop on to start the scene</span>
                  </div>
                )}
              </div>

              {/* Hop On Button */}
              <button
                onClick={() => handleJoinClick(room)}
                disabled={isFull}
                className={`w-full py-2.5 rounded-xl font-heading font-bold text-xs flex items-center justify-center gap-2 border transition-all ${
                  isFull
                    ? 'bg-white/5 border-white/10 text-white/40 cursor-not-allowed'
                    : 'bg-[#15151c] hover:bg-[#CCFF00] text-white hover:text-black border-white/20 hover:border-black shadow-sm'
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-[#CCFF00] group-hover:text-black" />
                <span>{isFull ? 'Table Full (6/6)' : '🔥 Hop On Mic'}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
