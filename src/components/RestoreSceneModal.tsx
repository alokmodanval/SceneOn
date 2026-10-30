import React, { useState } from 'react';
import { Key, X, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { SceneUser } from '../types';
import { getSceneUserByKey } from '../lib/supabase';
import { saveCurrentUser } from '../lib/identity';
import { playUiSound } from '../lib/audioEngine';
import confetti from 'canvas-confetti';

interface RestoreSceneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserRestored: (user: SceneUser) => void;
}

export const RestoreSceneModal: React.FC<RestoreSceneModalProps> = ({
  isOpen,
  onClose,
  onUserRestored,
}) => {
  const [sceneKey, setSceneKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = sceneKey.trim().toUpperCase();
    if (!cleanKey) {
      setError('Please enter your Scene Key');
      return;
    }

    setIsLoading(true);
    setError('');
    playUiSound('click');

    try {
      const user = await getSceneUserByKey(cleanKey);
      if (!user) {
        setError('No active profile found for this Scene Key. Double check or create a new scene!');
        setIsLoading(false);
        return;
      }

      saveCurrentUser(user);
      playUiSound('unlock');
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#CCFF00', '#8B5CF6'],
      });

      onUserRestored(user);
      onClose();
    } catch (err: any) {
      setError('Failed to restore scene. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#111116] border-2 border-violet-500/80 rounded-2xl p-6 sm:p-8 shadow-neo-violet">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-violet-400">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-heading font-black text-white">
              Restore My Scene
            </h2>
            <p className="text-xs font-mono text-white/60">
              Recover alias, aura, and vibes across devices
            </p>
          </div>
        </div>

        <form onSubmit={handleRestore} className="space-y-4">
          <div>
            <label className="text-xs font-mono text-white/70 block mb-1.5">
              ENTER YOUR SCENE KEY
            </label>
            <input
              type="text"
              autoFocus
              value={sceneKey}
              onChange={(e) => {
                setSceneKey(e.target.value.toUpperCase());
                setError('');
              }}
              placeholder="e.g. SCENE-9V2K-4M7Q"
              className="w-full px-4 py-3 rounded-xl bg-[#070709] border border-white/20 focus:border-violet-400 text-white font-mono text-base uppercase tracking-wider outline-none transition-colors"
            />
            <span className="text-[11px] font-mono text-white/40 mt-1 block">
              Format: SCENE-XXXX-XXXX (Saved in your original browser)
            </span>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !sceneKey.trim()}
            className="w-full neo-btn-lime py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="animate-pulse">Searching Scene Matrix...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Restore Scene Identity</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
