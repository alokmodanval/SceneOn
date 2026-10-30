import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  X,
  Send,
  Phone,
  Share2,
  Sparkles,
  ShieldAlert,
  Flame,
  Dices,
  Lock,
  Unlock,
  MessageSquare,
  Camera,
  Code2,
} from 'lucide-react';
import { SceneChat, SceneMessage, SceneUser, UserSocials } from '../types';
import { SPARK_GAME_CARDS } from '../lib/constants';
import {
  fetchSceneMessages,
  getOrCreateChat,
  sendSceneMessage,
  updateChatSocials,
  voteAura,
} from '../lib/supabase';
import { playUiSound } from '../lib/audioEngine';
import { DirectCallModal } from './DirectCallModal';

interface OneOnOneChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: SceneUser;
  targetUser: SceneUser;
}

const CREEP_REGEX = /\b(m or f|m\/f|asl|insta|ig|whatsapp|snap|number|pic|babe|single)\b/i;

export const OneOnOneChatModal: React.FC<OneOnOneChatModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  targetUser,
}) => {
  const [chat, setChat] = useState<SceneChat | null>(null);
  const [messages, setMessages] = useState<SceneMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [creepWarning, setCreepWarning] = useState('');
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [socialInputs, setSocialInputs] = useState<UserSocials>({
    instagram: '',
    discord: '',
    github: '',
  });
  const [isCalling, setIsCalling] = useState(false);
  const [hasTriggeredUnlockCelebration, setHasTriggeredUnlockCelebration] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize or fetch Chat
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    getOrCreateChat(currentUser.id, targetUser.id).then((c) => {
      if (!isMounted) return;
      setChat(c);
      fetchSceneMessages(c.id).then((msgs) => {
        if (!isMounted) return;
        setMessages(msgs);
      });
    });

    const handleSync = (e: any) => {
      if (e.detail?.type === 'new_message' && e.detail.chatId === chat?.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === e.detail.message.id)) return prev;
          return [...prev, e.detail.message];
        });
      }
    };

    window.addEventListener('sceneon-sync', handleSync);
    return () => {
      isMounted = false;
      window.removeEventListener('sceneon-sync', handleSync);
    };
  }, [isOpen, currentUser.id, targetUser.id, chat?.id]);

  // Scroll to bottom on message updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Calculate 10-Message Trust
  const totalMessagesCount = messages.length;
  const isTrustUnlocked = totalMessagesCount >= 10;

  // Trigger celebration once when trust threshold is reached
  useEffect(() => {
    if (isTrustUnlocked && !hasTriggeredUnlockCelebration) {
      setHasTriggeredUnlockCelebration(true);
      playUiSound('unlock');
      confetti({
        particleCount: 70,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#CCFF00', '#FF2E93', '#00F0FF'],
      });
    }
  }, [isTrustUnlocked, hasTriggeredUnlockCelebration]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string, msgType: 'text' | 'game_card' = 'text') => {
    const text = (textToSend || inputText).trim();
    if (!text || !chat) return;

    setCreepWarning('');

    // 1. Icebreaker prompt lock check on first message
    if (messages.length === 0 && text.length < 10) {
      setCreepWarning('To break the ice, your reply must be at least 10 characters long!');
      return;
    }

    // 2. Creep Guard Check for first 10 messages
    if (!isTrustUnlocked && CREEP_REGEX.test(text)) {
      playUiSound('kick');
      setCreepWarning(
        'Hold up! Build the vibe first—socials unlock automatically after 10 messages.'
      );
      return;
    }

    setInputText('');
    playUiSound('pop');

    const newMsg = await sendSceneMessage(chat.id, currentUser.id, text, msgType);
    setMessages((prev) => [...prev, newMsg]);
  };

  const handleDropSparkGame = () => {
    playUiSound('click');
    const randomCard = SPARK_GAME_CARDS[Math.floor(Math.random() * SPARK_GAME_CARDS.length)];
    const cardText = `🎲 [${randomCard.category}] ${randomCard.prompt}${
      randomCard.options ? `\nOptions: ${randomCard.options.join(' vs ')}` : ''
    }`;
    handleSendMessage(cardText, 'game_card');
  };

  const handleShareSocials = async () => {
    if (!chat) return;
    playUiSound('pop');
    await updateChatSocials(chat.id, currentUser.id, socialInputs);
    setShowSocialModal(false);
    confetti({ particleCount: 40, spread: 50 });
  };

  const handleAuraVote = async (amount: number) => {
    playUiSound('pop');
    const res = await voteAura(targetUser.id, currentUser.id, amount);
    if (!res.success) {
      alert(res.message);
    } else {
      alert(`Voted! ${amount > 0 ? '+1 W Scene' : '-2 L Creep'}`);
    }
  };

  const sharedByTarget = chat?.socials_shared?.[targetUser.id];
  const sharedByMe = chat?.socials_shared?.[currentUser.id];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#111116] border-2 border-[#CCFF00] rounded-3xl shadow-neo flex flex-col h-[90vh] max-h-[750px] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 bg-[#0D0D12] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-full bg-gradient-to-tr ${targetUser.avatar.bg} flex items-center justify-center text-xl border border-white/20`}
            >
              {targetUser.avatar.emoji}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-black text-white text-base">
                  {targetUser.alias}
                </h3>
                <span className="text-[10px] font-mono text-[#CCFF00] px-1.5 py-0.5 rounded bg-[#CCFF00]/10 border border-[#CCFF00]/30">
                  +{targetUser.scene_aura} Aura
                </span>
              </div>
              <span className="text-xs font-mono text-white/50 block">
                {targetUser.is_online ? '🟢 Online right now' : 'Active today'}
              </span>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2">
            {/* 1-on-1 Voice Call (Unlocked after 10 messages) */}
            <button
              onClick={() => {
                if (!isTrustUnlocked) {
                  alert('📞 1-on-1 Voice Call unlocks after reaching 10 messages in Scene Trust!');
                  return;
                }
                playUiSound('click');
                setIsCalling(true);
              }}
              title={isTrustUnlocked ? 'Start P2P Voice Call' : 'Locked until 10 messages'}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border transition-all ${
                isTrustUnlocked
                  ? 'bg-[#CCFF00] text-black border-black shadow-neo-sm hover:scale-105'
                  : 'bg-white/5 text-white/40 border-white/10 cursor-not-allowed'
              }`}
            >
              {isTrustUnlocked ? <Phone className="w-3.5 h-3.5 fill-current" /> : <Lock className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Call</span>
            </button>

            {/* Aura rating pills */}
            <button
              onClick={() => handleAuraVote(1)}
              title="Award W Scene (+1 Aura)"
              className="p-2 rounded-xl bg-white/5 hover:bg-[#CCFF00]/20 text-[#CCFF00] text-xs font-mono border border-white/10"
            >
              ⚡
            </button>
            <button
              onClick={() => handleAuraVote(-2)}
              title="Report L Creep (-2 Aura)"
              className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-rose-400 text-xs font-mono border border-white/10"
            >
              🚩
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 10-Message Progressive Trust Progress Bar */}
        <div className="bg-[#15151c] px-5 py-2.5 border-b border-white/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {isTrustUnlocked ? (
              <Unlock className="w-4 h-4 text-[#CCFF00]" />
            ) : (
              <Lock className="w-4 h-4 text-violet-400" />
            )}
            <span className="text-xs font-mono font-bold text-white">
              Scene Trust:{' '}
              <strong className={isTrustUnlocked ? 'text-[#CCFF00]' : 'text-violet-400'}>
                {Math.min(10, totalMessagesCount)}/10 Messages
              </strong>
            </span>
          </div>

          {/* Glowing bar */}
          <div className="flex-1 max-w-xs h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isTrustUnlocked ? 'bg-[#CCFF00] shadow-glow-lime' : 'bg-violet-500'
              }`}
              style={{ width: `${Math.min(100, (totalMessagesCount / 10) * 100)}%` }}
            />
          </div>

          {isTrustUnlocked && (
            <button
              onClick={() => {
                playUiSound('click');
                setShowSocialModal(true);
              }}
              className="text-xs font-mono font-bold text-[#00F0FF] hover:underline flex items-center gap-1"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Socials</span>
            </button>
          )}
        </div>

        {/* Mutual Socials Revealed Banner if both shared */}
        {sharedByTarget && (
          <div className="bg-[#00F0FF]/10 border-b border-[#00F0FF]/30 px-5 py-2 text-xs font-mono text-[#00F0FF] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>{targetUser.alias} shared socials:</span>
              {sharedByTarget.instagram && <span>IG: {sharedByTarget.instagram}</span>}
              {sharedByTarget.discord && <span>Discord: {sharedByTarget.discord}</span>}
              {sharedByTarget.github && <span>GitHub: {sharedByTarget.github}</span>}
            </div>
          </div>
        )}

        {/* Icebreaker Prompt Banner (Pinned at top of messages) */}
        <div className="bg-[#070709] px-5 py-3 border-b border-white/5 flex items-start gap-3">
          <span className="text-lg">💬</span>
          <div className="flex-1">
            <span className="text-[10px] font-mono text-[#CCFF00] font-bold block uppercase tracking-wider">
              {targetUser.alias}&apos;s Icebreaker Prompt:
            </span>
            <p className="text-xs sm:text-sm italic text-white/90">
              &quot;{targetUser.scene_prompt}&quot;
            </p>
          </div>
        </div>

        {/* Messages List Area */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 bg-[#070709]/50">
          {messages.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <span className="text-3xl">⚡</span>
              <h4 className="font-heading font-bold text-white text-base">
                Break The Ice!
              </h4>
              <p className="text-xs text-white/50 max-w-sm mx-auto">
                No &quot;hi/hello&quot; spam. Reply directly to {targetUser.alias}&apos;s icebreaker prompt above to begin.
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const isMe = msg.sender_id === currentUser.id;
            const isGameCard = msg.msg_type === 'game_card';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                {isGameCard ? (
                  <div className="p-4 rounded-2xl bg-[#15151c] border-2 border-[#CCFF00] max-w-sm shadow-neo-sm text-left">
                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#CCFF00] mb-1">
                      <Flame className="w-3.5 h-3.5 fill-[#CCFF00]" />
                      <span>SPARK A SCENE GAME CARD</span>
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-white whitespace-pre-wrap">
                      {msg.body}
                    </p>
                  </div>
                ) : (
                  <div
                    className={`px-4 py-2.5 rounded-2xl max-w-xs sm:max-w-md text-sm leading-relaxed ${
                      isMe
                        ? 'bg-[#CCFF00] text-black font-medium rounded-tr-none'
                        : 'bg-[#15151c] text-white border border-white/10 rounded-tl-none'
                    }`}
                  >
                    {msg.body}
                  </div>
                )}
                <span className="text-[10px] font-mono text-white/40 mt-1 px-1">
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Creep Guard Warning Banner if triggered */}
        {creepWarning && (
          <div className="px-4 py-2.5 bg-rose-500/15 border-t border-rose-500/40 text-rose-300 text-xs font-mono flex items-center gap-2 animate-fadeIn">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{creepWarning}</span>
          </div>
        )}

        {/* Bottom Chat Input Bar */}
        <div className="p-3 sm:p-4 bg-[#0D0D12] border-t border-white/10">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            {/* Spark A Scene Game Card Button */}
            <button
              type="button"
              onClick={handleDropSparkGame}
              title="Drop a Spark Game Card (This or That / Hot Take)"
              className="p-2.5 rounded-xl bg-white/5 hover:bg-[#CCFF00]/15 text-[#CCFF00] border border-white/10 hover:border-[#CCFF00] transition-all"
            >
              <Dices className="w-5 h-5" />
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setCreepWarning('');
              }}
              placeholder={
                messages.length === 0
                  ? `Reply to "${targetUser.scene_prompt.slice(0, 30)}..." (min 10 chars)`
                  : 'Type your message...'
              }
              className="flex-1 px-4 py-3 rounded-xl bg-[#070709] border border-white/20 focus:border-[#CCFF00] text-white text-sm outline-none transition-colors"
            />

            <button
              type="submit"
              disabled={!inputText.trim()}
              className="neo-btn-lime p-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Send className="w-4 h-4 fill-black" />
            </button>
          </form>
        </div>
      </div>

      {/* Share Socials Mutual Modal */}
      {showSocialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90">
          <div className="relative w-full max-w-md bg-[#111116] border-2 border-[#00F0FF] rounded-2xl p-6 shadow-neo-cyan space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-heading font-black text-white flex items-center gap-2">
                <Share2 className="w-5 h-5 text-[#00F0FF]" />
                <span>Drop Your Socials</span>
              </h3>
              <button
                onClick={() => setShowSocialModal(false)}
                className="p-1 rounded text-white/60 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-white/60">
              You achieved 10-message trust! Enter handles you are comfortable revealing to {targetUser.alias}.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-mono text-white/70 block mb-1">
                  INSTAGRAM HANDLE
                </label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#070709] border border-white/20">
                  <Camera className="w-4 h-4 text-pink-400" />
                  <input
                    type="text"
                    value={socialInputs.instagram || ''}
                    onChange={(e) =>
                      setSocialInputs({ ...socialInputs, instagram: e.target.value })
                    }
                    placeholder="@username"
                    className="bg-transparent text-xs text-white outline-none flex-1 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-mono text-white/70 block mb-1">
                  DISCORD USERNAME
                </label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#070709] border border-white/20">
                  <MessageSquare className="w-4 h-4 text-violet-400" />
                  <input
                    type="text"
                    value={socialInputs.discord || ''}
                    onChange={(e) =>
                      setSocialInputs({ ...socialInputs, discord: e.target.value })
                    }
                    placeholder="user#0000 or username"
                    className="bg-transparent text-xs text-white outline-none flex-1 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-mono text-white/70 block mb-1">
                  GITHUB USERNAME
                </label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#070709] border border-white/20">
                  <Code2 className="w-4 h-4 text-white" />
                  <input
                    type="text"
                    value={socialInputs.github || ''}
                    onChange={(e) =>
                      setSocialInputs({ ...socialInputs, github: e.target.value })
                    }
                    placeholder="github-username"
                    className="bg-transparent text-xs text-white outline-none flex-1 font-mono"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleShareSocials}
              className="w-full neo-btn-lime py-2.5 rounded-xl text-xs font-bold"
            >
              Reveal Social Handles
            </button>
          </div>
        </div>
      )}

      {/* 1-on-1 Voice Call Active Modal */}
      {isCalling && chat && (
        <DirectCallModal
          isOpen={isCalling}
          onClose={() => setIsCalling(false)}
          currentUser={currentUser}
          targetUser={targetUser}
          chatId={chat.id}
        />
      )}
    </div>
  );
};
