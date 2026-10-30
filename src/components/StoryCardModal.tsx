import React, { useEffect, useState } from 'react';
import { Download, Copy, Check, X, Share2, Sparkles, Camera } from 'lucide-react';
import { SceneUser } from '../types';
import { generateStoryCardBlob } from '../lib/storyCardGenerator';
import { playUiSound } from '../lib/audioEngine';
import confetti from 'canvas-confetti';

interface StoryCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: SceneUser;
}

export const StoryCardModal: React.FC<StoryCardModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [cardImage, setCardImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  const inviteLink = `https://friendsclub.tools4genz.com/?match=${currentUser.id}`;

  useEffect(() => {
    if (!isOpen) return;
    setIsGenerating(true);

    generateStoryCardBlob(currentUser)
      .then((url) => {
        setCardImage(url);
      })
      .catch((err) => {
        console.error('Failed to generate story card:', err);
      })
      .finally(() => {
        setIsGenerating(false);
      });
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!cardImage) return;
    playUiSound('pop');
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#CCFF00', '#FF2E93', '#00F0FF'],
    });

    const a = document.createElement('a');
    a.href = cardImage;
    a.download = `FriendsClub-${currentUser.alias}-StoryCard.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    playUiSound('click');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-[#111116] border-2 border-[#CCFF00] rounded-2xl p-6 sm:p-8 shadow-neo max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col lg:flex-row gap-8 items-center">
          {/* Left: Card Preview */}
          <div className="w-full lg:w-1/2 flex flex-col items-center justify-center">
            {isGenerating ? (
              <div className="w-64 h-[420px] rounded-2xl bg-[#15151c] border border-white/10 flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-mono text-white/60">
                  Synthesizing Aesthetic Story Card...
                </span>
              </div>
            ) : cardImage ? (
              <div className="relative group">
                <img
                  src={cardImage}
                  alt={`${currentUser.alias} Scene Card`}
                  className="w-64 sm:w-72 h-auto rounded-2xl border-2 border-white/20 shadow-glow-lime group-hover:scale-[1.02] transition-transform duration-300"
                />
                <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/80 border border-[#CCFF00] text-[10px] font-mono text-[#CCFF00]">
                  1080x1920 HD
                </div>
              </div>
            ) : (
              <div className="text-sm text-rose-400">Failed to render card</div>
            )}
          </div>

          {/* Right: Actions & Social Loops */}
          <div className="w-full lg:w-1/2 space-y-6 text-left">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/40 text-[#CCFF00] text-xs font-mono font-bold mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Spotify Wrapped & Receiptify Aesthetic</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-heading font-black text-white">
                Share Your Scene Card
              </h2>
              <p className="text-sm text-white/60 mt-1">
                Post this to your Instagram Story or WhatsApp Status. Anyone who clicks your link gets instant compatibility calculation with you!
              </p>
            </div>

            {/* Download Button */}
            <button
              onClick={handleDownload}
              disabled={isGenerating || !cardImage}
              className="w-full neo-btn-lime py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-neo-sm disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Download 1080x1920 Story PNG</span>
            </button>

            {/* Invite Link Box */}
            <div className="p-4 rounded-xl bg-[#15151c] border border-white/10 space-y-2">
              <label className="text-xs font-mono text-white/70 block">
                YOUR VIRAL MATCHING LINK
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  className="flex-1 px-3 py-2 rounded-lg bg-[#070709] border border-white/20 text-xs font-mono text-[#00F0FF] outline-none"
                />
                <button
                  onClick={handleCopyInviteLink}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-xs flex items-center gap-1.5 transition-all"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#CCFF00]" />
                      <span className="text-[#CCFF00]">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-white/60" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Share Buttons */}
            <div className="flex items-center gap-3">
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                  `Aaj ka scene kya hai? Check our Vibe Match % on FriendsClub (Zero-Login): ${inviteLink}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/40 text-[#25D366] text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>

              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                  `Aaj ka scene kya hai? Drop in and check our vibe match on FriendsClub: ${inviteLink} #FriendsClub`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#1DA1F2]/15 hover:bg-[#1DA1F2]/25 border border-[#1DA1F2]/40 text-[#1DA1F2] text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Twitter / X</span>
              </a>
            </div>

            <div className="text-[11px] font-mono text-white/40 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-pink-400" />
              <span>Tip: Add the invite link as a Link Sticker on your Instagram Story!</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
