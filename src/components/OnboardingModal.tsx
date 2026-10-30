import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { Dices, Sparkles, X, ChevronRight, Check, ArrowLeft } from 'lucide-react';
import { SceneUser, UserAvatar, VibeSliders } from '../types';
import {
  AVATAR_EMOJIS,
  AVATAR_GRADIENTS,
  ICEBREAKER_PRESETS,
  SCENE_TAG_CATEGORIES,
} from '../lib/constants';
import {
  createNewSceneUser,
  generateRandomAlias,
  generateRandomAvatar,
  saveCurrentUser,
} from '../lib/identity';
import { playUiSound } from '../lib/audioEngine';
import { upsertSceneUser } from '../lib/supabase';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: SceneUser | null;
  onUserSaved: (user: SceneUser) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserSaved,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [alias, setAlias] = useState(currentUser?.alias || generateRandomAlias());
  const [avatar, setAvatar] = useState<UserAvatar>(
    currentUser?.avatar || generateRandomAvatar()
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(
    currentUser?.tags || ['💻 Coding & Dev', '☕ Chai & Bakchodi', '🌙 3AM Rants']
  );
  const [sliders, setSliders] = useState<VibeSliders>(
    currentUser?.sliders || { talk: 65, owl: 15, hustle: 40 }
  );
  const [scenePrompt, setScenePrompt] = useState(
    currentUser?.scene_prompt || ICEBREAKER_PRESETS[0]
  );
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleRollAlias = () => {
    playUiSound('click');
    setAlias(generateRandomAlias());
  };

  const handleRollAvatar = () => {
    playUiSound('click');
    setAvatar(generateRandomAvatar());
  };

  const toggleTag = (tag: string) => {
    playUiSound('pop');
    setErrorMsg('');
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      if (selectedTags.length >= 6) {
        setErrorMsg('Max 6 tags allowed. Pick the ones closest to your vibe!');
        return;
      }
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleNext = () => {
    setErrorMsg('');
    playUiSound('click');

    if (step === 1) {
      if (!alias.trim()) {
        setErrorMsg('Please pick or roll an alias!');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (selectedTags.length < 3) {
        setErrorMsg('Please select at least 3 vibe tags to calculate matches!');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      if (!scenePrompt.trim()) {
        setErrorMsg('Please enter your current scene or pick one from below!');
        return;
      }
      handleComplete();
    }
  };

  const handleComplete = async () => {
    let savedUser: SceneUser;
    if (currentUser) {
      savedUser = {
        ...currentUser,
        alias: alias.trim(),
        avatar,
        tags: selectedTags,
        sliders,
        scene_prompt: scenePrompt.trim(),
        last_seen: new Date().toISOString(),
      };
      saveCurrentUser(savedUser);
      await upsertSceneUser(savedUser);
    } else {
      savedUser = createNewSceneUser({
        alias: alias.trim(),
        avatar,
        tags: selectedTags,
        sliders,
        scene_prompt: scenePrompt.trim(),
      });
    }

    playUiSound('unlock');
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#CCFF00', '#8B5CF6', '#FF2E93', '#00F0FF'],
    });

    onUserSaved(savedUser);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-xl bg-[#111116] border-2 border-[#CCFF00] rounded-2xl p-5 sm:p-8 shadow-neo max-h-[92dvh] overflow-y-auto">
        {/* Close Button */}
        {currentUser && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header / Step Tracker */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold text-[#CCFF00] uppercase tracking-wider">
              {currentUser ? '⚡ Update Your Scene' : '⚡ 15-Second Onboarding Wizard'}
            </span>
            <span className="text-xs font-mono text-white/50">
              Step {step} of 4
            </span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-[#CCFF00] transition-all duration-300"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* STEP 1: Alias & Avatar */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-heading font-black text-white">
                Pick Your Scene Alias & Vibe Avatar
              </h2>
              <p className="text-sm text-white/60 mt-1">
                Zero login. 100% anonymous. Roll a fresh Gen Z identity or type your own.
              </p>
            </div>

            {/* Avatar Showcase & Randomizer */}
            <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-[#15151c] border border-white/10">
              <div className="relative">
                <div
                  className={`w-24 h-24 rounded-2xl bg-gradient-to-tr ${avatar.bg} flex items-center justify-center text-4xl shadow-glow-lime border-2 border-white/20`}
                >
                  {avatar.emoji}
                </div>
                <button
                  type="button"
                  onClick={handleRollAvatar}
                  title="Roll random avatar"
                  className="absolute -bottom-2 -right-2 p-2 rounded-lg bg-[#CCFF00] text-black hover:scale-110 active:scale-95 transition-all shadow-md"
                >
                  <Dices className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 w-full space-y-3">
                <label className="text-xs font-mono text-white/70 block">
                  GEN Z ALIAS
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={alias}
                    maxLength={20}
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="e.g. MidnightYapper"
                    className="flex-1 px-4 py-2.5 rounded-lg bg-[#070709] border border-white/20 focus:border-[#CCFF00] text-white font-heading font-bold outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={handleRollAlias}
                    className="px-3 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-xs flex items-center gap-1.5 transition-all"
                  >
                    <Dices className="w-4 h-4 text-[#CCFF00]" />
                    <span>Roll</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Emoji & Gradient Quick Select */}
            <div className="space-y-3">
              <label className="text-xs font-mono text-white/70 block">
                CUSTOMIZE AVATAR GRADIENT & EXPRESSION
              </label>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {AVATAR_GRADIENTS.map((grad) => (
                  <button
                    key={grad}
                    type="button"
                    onClick={() => {
                      playUiSound('pop');
                      setAvatar({ ...avatar, bg: grad });
                    }}
                    className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${grad} flex-shrink-0 border-2 transition-all ${
                      avatar.bg === grad
                        ? 'border-[#CCFF00] scale-110 shadow-neo-sm'
                        : 'border-transparent opacity-75 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {AVATAR_EMOJIS.slice(0, 10).map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      playUiSound('pop');
                      setAvatar({ ...avatar, emoji });
                    }}
                    className={`w-9 h-9 rounded-lg bg-[#15151c] flex items-center justify-center text-lg flex-shrink-0 border transition-all ${
                      avatar.emoji === emoji
                        ? 'border-[#CCFF00] bg-[#CCFF00]/10 scale-105'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Scene Interest Pills */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-heading font-black text-white">
                  Pick Your Scene Interests
                </h2>
                <span
                  className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full ${
                    selectedTags.length >= 3
                      ? 'bg-[#CCFF00]/20 text-[#CCFF00] border border-[#CCFF00]/40'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  }`}
                >
                  {selectedTags.length}/6 Picked (Min 3)
                </span>
              </div>
              <p className="text-sm text-white/60 mt-1">
                Our algorithm uses weighted Jaccard similarity (60%) on these tags to match you.
              </p>
            </div>

            <div className="space-y-5">
              {SCENE_TAG_CATEGORIES.map((category) => (
                <div key={category.category} className="space-y-2">
                  <h3 className="text-xs font-mono text-white/50 uppercase tracking-wider">
                    {category.category}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {category.tags.map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-[#CCFF00] text-black font-bold border-2 border-black shadow-neo-sm scale-105'
                              : 'bg-[#15151c] text-white/80 border border-white/10 hover:border-white/30 hover:text-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          <span>{tag}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: Vibe Sliders */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-heading font-black text-white">
                Tune Your 3 Vibe Frequencies
              </h2>
              <p className="text-sm text-white/60 mt-1">
                40% of your Scene Match is calculated via 3D Euclidean distance on these sliders.
              </p>
            </div>

            <div className="space-y-6 py-2">
              {/* Slider 1: Introvert vs Yapper */}
              <div className="space-y-2 p-4 rounded-xl bg-[#15151c] border border-white/10">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-white/60">Quiet Introvert 🤫</span>
                  <span className="text-[#CCFF00] font-bold">
                    {sliders.talk < 35
                      ? 'Quiet Observer'
                      : sliders.talk > 65
                      ? 'Full Yapper 🗣️'
                      : 'Balanced Conversationalist'} ({sliders.talk}%)
                  </span>
                  <span className="text-white/60">Full Yapper 🗣️</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliders.talk}
                  onChange={(e) => setSliders({ ...sliders, talk: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              {/* Slider 2: Night Owl vs Early Bird */}
              <div className="space-y-2 p-4 rounded-xl bg-[#15151c] border border-white/10">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-white/60">Night Owl 🦉</span>
                  <span className="text-violet-400 font-bold">
                    {sliders.owl < 35
                      ? '3 AM Creature 🌙'
                      : sliders.owl > 65
                      ? 'Early Bird ☀️'
                      : 'Flexible Sleeper'} ({sliders.owl}%)
                  </span>
                  <span className="text-white/60">Early Bird ☀️</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliders.owl}
                  onChange={(e) => setSliders({ ...sliders, owl: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              {/* Slider 3: Hustle vs Pure Chill */}
              <div className="space-y-2 p-4 rounded-xl bg-[#15151c] border border-white/10">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-white/60">Serious Hustle ⚡</span>
                  <span className="text-[#FF2E93] font-bold">
                    {sliders.hustle < 35
                      ? 'Grind Mode 24/7 💻'
                      : sliders.hustle > 65
                      ? 'Pure Chill & Memes 🍕'
                      : 'Work Hard Play Hard'} ({sliders.hustle}%)
                  </span>
                  <span className="text-white/60">Pure Chill 🍕</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliders.hustle}
                  onChange={(e) => setSliders({ ...sliders, hustle: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Scene Status & Icebreaker Prompt */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-heading font-black text-white">
                Set Your Current Scene & Icebreaker
              </h2>
              <p className="text-sm text-white/60 mt-1">
                To start a chat, people must reply directly to this prompt. No low-effort &quot;hi/hello&quot; spam allowed.
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-mono text-white/70 block">
                YOUR ICEBREAKER PROMPT / CURRENT SCENE
              </label>
              <textarea
                rows={3}
                value={scenePrompt}
                maxLength={140}
                onChange={(e) => setScenePrompt(e.target.value)}
                placeholder="What is your current scene or question?"
                className="w-full px-4 py-3 rounded-xl bg-[#070709] border border-white/20 focus:border-[#CCFF00] text-white font-medium text-sm outline-none resize-none"
              />
              <div className="flex justify-between text-xs font-mono text-white/40">
                <span>Must be engaging for instant connection</span>
                <span>{scenePrompt.length}/140</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-mono text-white/50 block">
                QUICK GEN Z PRESETS (CLICK TO USE)
              </span>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {ICEBREAKER_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      playUiSound('pop');
                      setScenePrompt(preset);
                    }}
                    className={`w-full text-left p-2.5 rounded-lg text-xs transition-all border ${
                      scenePrompt === preset
                        ? 'bg-[#CCFF00]/10 border-[#CCFF00] text-white font-medium'
                        : 'bg-[#15151c] border-white/10 text-white/70 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    💬 {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Bottom Navigation Buttons */}
        <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between gap-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                playUiSound('click');
                setStep((step - 1) as any);
              }}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 font-mono text-xs flex items-center gap-1.5 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={handleNext}
            className="neo-btn-lime px-6 py-3 rounded-xl text-sm flex items-center gap-2"
          >
            {step === 4 ? (
              <>
                <Sparkles className="w-4 h-4 fill-black" />
                <span>🔥 Lock In My Scene & Vibe</span>
              </>
            ) : (
              <>
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
