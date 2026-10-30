import React, { useState } from 'react';
import { Radio, X, Sparkles, MessageSquare } from 'lucide-react';
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

export const HostRoomModal: React.FC<HostRoomModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onRoomCreated,
}) => {
  const [title, setTitle] = useState('');
  const [vibeTag, setVibeTag] = useState(ALL_TAGS[0]);
  const [topic, setTopic] = useState(TOPIC_DECK[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a scene room title');
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
        created_at: new Date().toISOString(),
        participants: [
          {
            id: currentUser.id,
            alias: currentUser.alias,
            avatar: currentUser.avatar,
            is_muted: true,
            is_speaking: false,
            voice_filter: 'natural',
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
        colors: ['#CCFF00', '#8B5CF6'],
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#111116] border-2 border-[#CCFF00] rounded-2xl p-6 sm:p-8 shadow-neo">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#CCFF00]/15 border border-[#CCFF00]/40 flex items-center justify-center text-[#CCFF00]">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-heading font-black text-white">
              Host a Live Voice Scene
            </h2>
            <p className="text-xs font-mono text-white/60">
              6-user peer-to-peer audio micro-pod (100% Free & Zero-Login)
            </p>
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="text-xs font-mono text-white/70 block mb-1">
              SCENE TITLE
            </label>
            <input
              type="text"
              autoFocus
              maxLength={40}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError('');
              }}
              placeholder="e.g. 🎧 Weekend Desi Hip-Hop Listening Party"
              className="w-full px-4 py-2.5 rounded-xl bg-[#070709] border border-white/20 focus:border-[#CCFF00] text-white font-medium text-sm outline-none transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-white/70 block mb-1">
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

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-mono text-white/70 block">
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
            <span className="text-white/60">Capacity</span>
            <span className="text-[#CCFF00] font-bold">Max 6 Speakers (Mesh P2P)</span>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !title.trim()}
            className="w-full neo-btn-lime py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Radio className="w-4 h-4" />
            <span>Launch Live Scene Table</span>
          </button>
        </form>
      </div>
    </div>
  );
};
