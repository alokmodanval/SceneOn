import React, { useState } from 'react';
import { Radio, Users, Plus, Lock, Globe, Key, X, ShieldAlert, Sparkles } from 'lucide-react';
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
  const [filterType, setFilterType] = useState<'all' | 'public' | 'private'>('all');
  const [pinPromptRoom, setPinPromptRoom] = useState<SceneRoom | null>(null);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');

  const handleJoinClick = (room: SceneRoom) => {
    playUiSound('click');
    if (!currentUser) {
      onOpenOnboarding();
      return;
    }

    // Check if room is private
    if (room.is_private && room.host_id !== currentUser.id) {
      setPinPromptRoom(room);
      setEnteredPin('');
      setPinError('');
      return;
    }

    onJoinRoom(room);
  };

  const handleVerifyPinAndJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinPromptRoom) return;

    if (pinPromptRoom.room_pin && enteredPin.trim() !== pinPromptRoom.room_pin.trim()) {
      playUiSound('pop');
      setPinError('Incorrect 4-digit PIN! Ask the host for the code.');
      return;
    }

    playUiSound('unlock');
    const target = pinPromptRoom;
    setPinPromptRoom(null);
    onJoinRoom(target);
  };

  const filteredRooms = rooms.filter((r) => {
    if (filterType === 'public') return !r.is_private;
    if (filterType === 'private') return r.is_private;
    return true;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner & Host CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-3xl bg-[#111116] border border-white/10 shadow-neo-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CCFF00] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CCFF00]"></span>
            </span>
            <span className="text-xs font-mono font-bold text-[#CCFF00] uppercase tracking-wider">
              ZERO-COST P2P AUDIO ROOMS
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-heading font-black text-white">
            Live Voice Scenes & Audio Pods
          </h2>
          <p className="text-xs sm:text-sm text-white/60 mt-0.5">
            6-seat audio tables with soundboard, stage controls & Web Audio voice filters.
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
          className="neo-btn-lime px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 flex-shrink-0 shadow-neo"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>+ Host a Scene (Global / Private)</span>
        </button>
      </div>

      {/* Filter Tabs (All, Public, Private VIP) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => {
            playUiSound('pop');
            setFilterType('all');
          }}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border ${
            filterType === 'all'
              ? 'bg-[#CCFF00] text-black border-black shadow-neo-sm'
              : 'bg-[#111116] text-white/70 border-white/10 hover:border-white/30'
          }`}
        >
          All Scenes ({rooms.length})
        </button>

        <button
          onClick={() => {
            playUiSound('pop');
            setFilterType('public');
          }}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-all border ${
            filterType === 'public'
              ? 'bg-[#CCFF00] text-black font-bold border-black shadow-neo-sm'
              : 'bg-[#111116] text-white/70 border-white/10 hover:border-white/30'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>🌐 Global Public</span>
        </button>

        <button
          onClick={() => {
            playUiSound('pop');
            setFilterType('private');
          }}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-all border ${
            filterType === 'private'
              ? 'bg-violet-500 text-white font-bold border-violet-400 shadow-neo-violet'
              : 'bg-[#111116] text-white/70 border-white/10 hover:border-white/30'
          }`}
        >
          <Lock className="w-3.5 h-3.5 text-violet-400" />
          <span>🔒 Private VIP</span>
        </button>
      </div>

      {/* Empty State */}
      {filteredRooms.length === 0 && (
        <div className="text-center py-12 px-6 rounded-3xl bg-[#111116] border border-white/10 max-w-md mx-auto space-y-3">
          <Lock className="w-10 h-10 text-violet-400 mx-auto" />
          <h3 className="font-heading font-bold text-white text-base">
            No {filterType === 'private' ? 'Private' : 'Public'} Scenes Found
          </h3>
          <p className="text-xs text-white/50">
            Be the first to launch a new {filterType === 'private' ? 'Private VIP' : 'Global'} voice scene!
          </p>
          <button
            onClick={() => {
              playUiSound('click');
              if (!currentUser) onOpenOnboarding();
              else onOpenHostModal();
            }}
            className="neo-btn-lime px-4 py-2 rounded-xl text-xs font-bold"
          >
            + Host Now
          </button>
        </div>
      )}

      {/* Rooms Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRooms.map((room) => {
          const count = room.participants?.length || 0;
          const isFull = count >= (room.max_users || 6);

          return (
            <div
              key={room.id}
              className={`group relative flex flex-col justify-between p-5 rounded-3xl bg-[#111116] border transition-all duration-300 hover:shadow-neo-sm ${
                room.is_private
                  ? 'border-violet-500/30 hover:border-violet-400'
                  : 'border-white/10 hover:border-[#CCFF00]/50'
              }`}
            >
              <div>
                {/* Header Tag, Privacy Badge & Occupancy */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/80">
                      {room.vibe_tag}
                    </span>
                    {room.is_private ? (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        <span>Private VIP</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <Globe className="w-2.5 h-2.5" />
                        <span>Global</span>
                      </span>
                    )}
                  </div>

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
                <div className="p-3 rounded-2xl bg-[#070709] border border-white/5 mb-4 text-left">
                  <span className="text-[10px] font-mono text-white/40 block mb-0.5 font-bold">
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
                    : room.is_private
                    ? 'bg-violet-600/30 hover:bg-violet-500 text-white border-violet-500/40 hover:border-violet-400'
                    : 'bg-[#15151c] hover:bg-[#CCFF00] text-white hover:text-black border-white/20 hover:border-black shadow-sm'
                }`}
              >
                {room.is_private ? (
                  <>
                    <Key className="w-3.5 h-3.5 text-violet-300" />
                    <span>Enter Private Room (PIN)</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-3.5 h-3.5 text-[#CCFF00] group-hover:text-black" />
                    <span>{isFull ? 'Table Full (6/6)' : '🔥 Hop On Mic'}</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Private Room PIN Entry Modal */}
      {pinPromptRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-sm bg-[#111116] border-2 border-violet-400 rounded-3xl p-6 shadow-neo-violet space-y-4">
            <button
              onClick={() => setPinPromptRoom(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/5 text-white/60 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center text-violet-300 mx-auto mb-2">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="font-heading font-black text-lg text-white">
                Private VIP Scene
              </h3>
              <p className="text-xs text-white/60">
                &quot;{pinPromptRoom.title}&quot; requires a 4-digit PIN to enter.
              </p>
            </div>

            <form onSubmit={handleVerifyPinAndJoin} className="space-y-4">
              <div>
                <input
                  type="text"
                  maxLength={4}
                  autoFocus
                  value={enteredPin}
                  onChange={(e) => {
                    setEnteredPin(e.target.value.replace(/[^0-9]/g, ''));
                    setPinError('');
                  }}
                  placeholder="• • • •"
                  className="w-full tracking-widest text-center text-2xl font-mono font-black py-3 rounded-2xl bg-[#070709] border-2 border-violet-400/50 focus:border-[#CCFF00] text-[#CCFF00] outline-none"
                />
              </div>

              {pinError && (
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono text-center">
                  ⚠️ {pinError}
                </div>
              )}

              <button
                type="submit"
                disabled={enteredPin.length < 4}
                className="w-full py-3 rounded-2xl bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white font-heading font-bold text-sm shadow-neo-violet transition-all"
              >
                🔓 Unlock & Join Table
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
