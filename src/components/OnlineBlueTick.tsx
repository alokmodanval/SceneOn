import React from 'react';

interface OnlineBlueTickProps {
  isOnline: boolean;
  showLabel?: boolean;
  size?: 'xs' | 'sm' | 'md';
}

export const OnlineBlueTick: React.FC<OnlineBlueTickProps> = ({
  isOnline,
  showLabel = false,
  size = 'sm',
}) => {
  if (!isOnline) {
    if (!showLabel) return null;
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-white/40 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-white/25" />
        <span>Offline</span>
      </span>
    );
  }

  const dim = size === 'xs' ? 'w-3.5 h-3.5' : size === 'md' ? 'w-4.5 h-4.5' : 'w-4 h-4';

  return (
    <span
      className="inline-flex items-center gap-1 flex-shrink-0"
      title="Online now on ChessChat"
    >
      <svg
        viewBox="0 0 24 24"
        className={`${dim} text-[#1D9BF0] drop-shadow-[0_0_6px_rgba(29,155,240,0.65)]`}
        aria-label="Online Verified"
      >
        <circle cx="12" cy="12" r="10.5" fill="currentColor" />
        <path
          d="M8.5 12.5l2.3 2.3 4.8-5.2"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showLabel && (
        <span className="text-[10px] font-mono font-bold text-[#38BDF8]">Online</span>
      )}
    </span>
  );
};
