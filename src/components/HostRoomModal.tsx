import React, { useState } from 'react';
import { Radio, X, Sparkles, Lock, Globe, Key, Users, Flame, Dice5 } from 'lucide-react';
import { SceneRoom, SceneUser } from '../types';
import { ALL_TAGS, TOPIC_DECK } from '../lib/constants';
import { upsertSceneRoom } from '../lib/supabase';
import { playUiSound } from '../lib/audioEngine';
import confetti from 'canvas-confetti';

interface HostRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: SceneUser;
  onRoomCreated: (room: SceneRoom) => void;
}

const ROOM_TITLE_PRESETS = [
  '☕ Late Night Tapri & Bakchodi',
  '💻 Midnight Coders & Builders Lounge',
  '🎧 Lo-Fi Beats & Indie Listening Party',
  '💔 3AM Vent & Relationship Dilemmas',
  '🎬 Bollywood, Anime & Hot Takes Debate',
  '🎮 Valorant / BGMI Chill Squad Hangout',
];

export const HostRoomModal: React.FC<HostRoomModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onRoomCreated,
}) => {
  const [title, setTitle] = useState('');
  const [vibeTag, setVibeTag] = useState(ALL_TAGS[0]);
  const [topic, setTopic] = useState(TOPIC_DECK[0]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [roomPin, setRoomPin] = useState(() => Math.floor(1000 + Math.random() * 9000).toString());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleGenerateNewPin = () => {
    playUiSound('pop');
    setRoomPin(Math.floor(1000 + Math.random() * 9000).toString());
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a scene room title');
      return;
    }
    if (isPrivate && (!roomPin || roomPin.length < 4)) {
      setError('Please enter a 4-digit PIN for your private room');
      return;
    }

    setIsSubmitting(true);
    playUiSound('click');

    try {
      const newRoom: SceneRoom = {
        id: `room-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: title.trim(),
        vibe_tag: vibeTag,
        max_users: 6,
        active_topic: topic.trim() || 'Aaj ka scene kya hai? Let’s talk!',
        kick_votes: {},
        is_private: isPrivate,
        room_pin: isPrivate ? roomPin.trim() : undefined,
        host_id: currentUser.id,
        locked_seats: [],
        created_at: new Date().toISOString(),
        participants: [
          {
            id: currentUser.id,
            alias: currentUser.alias,
            avatar: currentUser.avatar,
            is_muted: true,
            is_speaking: false,
            voice_filter: 'natural',
            role: 'host',
            seat_number: 1,
            joined_at: new Date().toISOString(),
          },
        ],
      };

      await upsertSceneRoom(newRoom);
      playUiSound('unlock');
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#CCFF00', '#8B5CF6', '#FF2E93'],
      });

      onRoomCreated(newRoom);
      onClose();
    } catch (err) {
      setError('Could not create room. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#111116] border-2 border-[#CCFF00] rounded-3xl p-5 sm:p-7 shadow-neo max-h-[92dvh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-[#CCFF00]/15 border border-[#CCFF00]/40 flex items-center justify-center text-[#CCFF00]">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-heading font-black text-white">
              Host a Voice Scene
            </h2>
            <p className="text-xs font-mono text-white/60">
              6-user P2P audio room with interactive soundboard & seat controls
            </p>
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Room Type Selector: Global vs Private VIP */}
          <div>
            <label className="text-[11px] font-mono text-white/70 block mb-1.5 uppercase tracking-wider font-bold">
              ROOM PRIVACY MODE
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  playUiSound('pop');
                  setIsPrivate(false);
                }}
                className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                  !isPrivate
                    ? 'bg-[#CCFF00]/15 border-[#CCFF00] shadow-glow-lime text-white'
                    : 'bg-[#15151c] border-white/10 text-white/60 hover:border-white/30'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-heading font-bold text-sm">
                    <Globe className={`w-4 h-4 ${!isPrivate ? 'text-[#CCFF00]' : 'text-white/40'}`} />
                    <span>Global Room</span>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${!isPrivate ? 'bg-[#CCFF00] text-black font-bold' : 'bg-white/5 text-white/40'}`}>
                    Public
                  </span>
                </div>
                <p className="text-[10px] text-white/50 leading-tight">
                  Listed on discovery board. Any Gen Z peer can hop on mic.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  playUiSound('pop');
                  setIsPrivate(true);
                }}
                className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                  isPrivate
                    ? 'bg-violet-500/20 border-violet-400 shadow-neo-violet text-white'
                    : 'bg-[#15151c] border-white/10 text-white/60 hover:border-white/30'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-heading font-bold text-sm">
                    <Lock className={`w-4 h-4 ${isPrivate ? 'text-violet-400' : 'text-white/40'}`} />
                    <span>Private VIP</span>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isPrivate ? 'bg-violet-500 text-white font-bold' : 'bg-white/5 text-white/40'}`}>
                    4-Digit PIN
                  </span>
                </div>
                <p className="text-[10px] text-white/50 leading-tight">
                  Protected with a 4-digit PIN. Only invited friends can enter.
                </p>
              </button>
            </div>
          </div>

          {/* If Private: Show PIN Field */}
          {isPrivate && (
            <div className="p-3.5 rounded-2xl bg-violet-950/30 border border-violet-500/30 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono text-violet-300 flex items-center gap-1.5 font-bold">
                  <Key className="w-3.5 h-3.5 text-violet-400" />
                  <span>4-DIGIT ROOM ENTRY PIN:</span>
                </label>
                <button
                  type="button"
                  onClick={handleGenerateNewPin}
                  className="text-[11px] font-mono text-[#CCFF00] hover:underline flex items-center gap-1"
                >
                  <Dice5 className="w-3 h-3" />
                  <span>Random PIN</span>
                </button>
              </div>
              <input
                type="text"
                maxLength={4}
                value={roomPin}
                onChange={(e) => setRoomPin(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="4-digit PIN e.g. 7789"
                className="w-full tracking-widest text-center text-lg font-mono font-black py-2 rounded-xl bg-[#070709] border border-violet-400/40 text-[#CCFF00] outline-none"
              />
              <p className="text-[10px] text-white/50 text-center font-mono">
                Friends will enter this PIN or click your shared direct link to hop in!
              </p>
            </div>
          )}

          {/* Scene Title */}
          <div>
            <label className="text-xs font-mono text-white/70 block mb-1 uppercase font-bold">
              SCENE ROOM TITLE
            </label>
            <input
              type="text"
              autoFocus
              maxLength={50}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError('');
              }}
              placeholder="e.g. ☕ Late Night Tapri & Chitchat"
              className="w-full px-4 py-2.5 rounded-xl bg-[#070709] border border-white/20 focus:border-[#CCFF00] text-white font-medium text-sm outline-none transition-colors"
            />
            {/* Quick Title Presets */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ROOM_TITLE_PRESETS.slice(0, 3).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    playUiSound('pop');
                    setTitle(preset);
                  }}
                  className="text-[10px] font-mono px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10"
                >
                  {preset.split(' ')[0]} {preset.split(' ').slice(1, 3).join(' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Primary Vibe Tag */}
          <div>
            <label className="text-xs font-mono text-white/70 block mb-1 uppercase font-bold">
              PRIMARY VIBE TAG
            </label>
            <select
              value={vibeTag}
              onChange={(e) => setVibeTag(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[#070709] border border-white/20 focus:border-[#CCFF00] text-white text-xs font-mono outline-none"
            >
              {ALL_TAGS.map((tag) => (
                <option key={tag} value={tag} className="bg-[#111116] text-white">
                  {tag}
                </option>
              ))}
            </select>
          </div>

          {/* Starter Discussion Topic */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-mono text-white/70 block uppercase font-bold">
                STARTER DISCUSSION TOPIC
              </label>
              <button
                type="button"
                onClick={() => {
                  playUiSound('pop');
                  const nextTopic = TOPIC_DECK[Math.floor(Math.random() * TOPIC_DECK.length)];
                  setTopic(nextTopic);
                }}
                className="text-[11px] font-mono text-[#CCFF00] hover:underline flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                <span>Randomize Topic</span>
              </button>
            </div>
            <textarea
              rows={2}
              value={topic}
              maxLength={120}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full px-4 py-2 rounded-xl bg-[#070709] border border-white/20 focus:border-[#CCFF00] text-white text-xs outline-none resize-none"
            />
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs font-mono">
            <span className="text-white/60">Stage Capacity:</span>
            <span className="text-[#CCFF00] font-bold flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              <span>6 Speaker Seats (Mesh P2P Audio)</span>
            </span>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !title.trim()}
            className="w-full neo-btn-lime py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-neo"
          >
            <Radio className="w-4 h-4" />
            <span>{isPrivate ? '🔒 Launch Private VIP Scene' : '🔥 Launch Global Scene Table'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
