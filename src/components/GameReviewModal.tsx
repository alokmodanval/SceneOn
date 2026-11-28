import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Chess, Square } from 'chess.js';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  X,
} from 'lucide-react';
import { CHESS_PIECE_SVGS, playChessSound } from '../lib/chessHelpers';
import {
  analyzeChessGame,
  MoveQuality,
} from '../lib/chessReview';

interface GameReviewModalProps {
  isOpen: boolean;
  pgn: string;
  whiteAlias: string;
  blackAlias: string;
  initialOrientation?: 'w' | 'b';
  onClose: () => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS_WHITE = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;
const RANKS_BLACK = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
const FILES_BLACK = ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] as const;

const QUALITY_META: {
  key: MoveQuality;
  label: string;
  badge: string;
  colorClass: string;
}[] = [
  { key: 'brilliant', label: 'Brilliant', badge: '!!', colorClass: 'text-[#00F0FF] bg-[#00F0FF]/15 border-[#00F0FF]/40' },
  { key: 'great', label: 'Great', badge: '!', colorClass: 'text-[#38BDF8] bg-[#38BDF8]/15 border-[#38BDF8]/40' },
  { key: 'best', label: 'Best', badge: '★', colorClass: 'text-[#CCFF00] bg-[#CCFF00]/15 border-[#CCFF00]/40' },
  { key: 'good', label: 'Good', badge: '✓', colorClass: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30' },
  { key: 'book', label: 'Book', badge: '📖', colorClass: 'text-amber-300 bg-amber-500/15 border-amber-400/30' },
  { key: 'inaccuracy', label: 'Inaccuracy', badge: '?!', colorClass: 'text-yellow-300 bg-yellow-500/15 border-yellow-400/35' },
  { key: 'mistake', label: 'Mistake', badge: '?', colorClass: 'text-orange-300 bg-orange-500/15 border-orange-400/40' },
  { key: 'blunder', label: 'Blunder', badge: '??', colorClass: 'text-rose-300 bg-rose-500/20 border-rose-500/50' },
];

export const GameReviewModal: React.FC<GameReviewModalProps> = ({
  isOpen,
  pgn,
  whiteAlias,
  blackAlias,
  initialOrientation = 'w',
  onClose,
}) => {
  const report = useMemo(() => analyzeChessGame(pgn), [pgn]);
  const [cursor, setCursor] = useState<number>(() => report.moves.length);
  const [orientation] = useState<'w' | 'b'>(initialOrientation);

  if (!isOpen) return null;

  const activeMove = cursor > 0 ? report.moves[cursor - 1] : null;
  const activeFen = activeMove ? activeMove.fenAfter : report.startFen;
  const chess = new Chess(activeFen);
  const board = chess.board();

  const evalCp = activeMove ? activeMove.evalAfterWhiteCp : 0;
  const clampedEval = Math.max(-1000, Math.min(1000, evalCp));
  const whiteBarPct = Math.round(((clampedEval + 1000) / 2000) * 100);
  const evalLabel =
    Math.abs(evalCp) >= 40000
      ? evalCp > 0
        ? 'M#'
        : '-M#'
      : `${evalCp >= 0 ? '+' : ''}${(evalCp / 100).toFixed(1)}`;

  const displayRanks = orientation === 'w' ? RANKS_WHITE : RANKS_BLACK;
  const displayFiles = orientation === 'w' ? FILES : FILES_BLACK;

  const activeMeta = activeMove
    ? QUALITY_META.find((q) => q.key === activeMove.quality)
    : null;

  const stepTo = (nextIdx: number) => {
    const bounded = Math.max(0, Math.min(report.moves.length, nextIdx));
    setCursor(bounded);
    playChessSound('move');
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md">
      <div className="relative w-full max-w-5xl max-h-[94dvh] bg-[#111116] border-2 border-[#CCFF00] rounded-3xl p-4 sm:p-6 shadow-neo flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 text-[#CCFF00] flex-shrink-0" />
            <h3 className="font-heading font-black text-base sm:text-xl text-white truncate">
              ChessChat Game Review
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close game review"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-white/75"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto pt-4 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: Eval Bar + Replay Board */}
          <div className="lg:col-span-6 space-y-3">
            <div className="flex items-stretch gap-2 max-w-[400px] mx-auto">
              {/* Vertical Eval Bar */}
              <div className="w-6 rounded-lg overflow-hidden bg-[#181822] border border-white/15 flex flex-col justify-between relative select-none">
                <div
                  className="bg-slate-900 transition-all duration-300"
                  style={{ height: `${100 - whiteBarPct}%` }}
                />
                <div
                  className="bg-white transition-all duration-300"
                  style={{ height: `${whiteBarPct}%` }}
                />
                <span className="absolute inset-x-0 top-1 text-[9px] font-mono font-bold text-center text-white mix-blend-difference">
                  {evalLabel}
                </span>
              </div>

              {/* 8x8 Board */}
              <div className="flex-1 aspect-square rounded-2xl overflow-hidden border-2 border-white/20 grid grid-cols-8 grid-rows-8">
                {displayRanks.map((rank) =>
                  displayFiles.map((file) => {
                    const sq = `${file}${rank}` as Square;
                    const rankIndex = 8 - Number(rank);
                    const fileIndex = FILES.indexOf(file);
                    const piece = board[rankIndex]?.[fileIndex];
                    const isLight = (fileIndex + rankIndex) % 2 === 0;
                    const isLast = activeMove && (activeMove.from === sq || activeMove.to === sq);

                    let bg = isLight ? 'bg-[#D6D8E4]' : 'bg-[#635985]';
                    if (isLast) bg = isLight ? 'bg-[#D8F36A]' : 'bg-[#8BA83B]';

                    return (
                      <div key={sq} className={`flex items-center justify-center ${bg}`}>
                        {piece && (
                          <svg viewBox="0 0 45 45" className="w-6 h-6 sm:w-8 sm:h-8 pointer-events-none">
                            <g
                              fill={piece.color === 'w' ? '#FFFFFF' : '#11131A'}
                              stroke={piece.color === 'w' ? '#0F172A' : '#E2E8F0'}
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              {CHESS_PIECE_SVGS[piece.type].map((d, idx) => (
                                <path key={idx} d={d} />
                              ))}
                            </g>
                          </svg>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => stepTo(0)}
                disabled={cursor === 0}
                className="p-2 rounded-xl bg-[#070709] border border-white/15 disabled:opacity-40 text-white"
                aria-label="Start position"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => stepTo(cursor - 1)}
                disabled={cursor === 0}
                className="px-3.5 py-2 rounded-xl bg-[#070709] border border-white/15 disabled:opacity-40 text-white"
                aria-label="Previous move"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-xs font-mono text-white/75">
                {cursor} / {report.moves.length}
              </span>
              <button
                type="button"
                onClick={() => stepTo(cursor + 1)}
                disabled={cursor === report.moves.length}
                className="px-3.5 py-2 rounded-xl bg-[#070709] border border-white/15 disabled:opacity-40 text-white"
                aria-label="Next move"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => stepTo(report.moves.length)}
                disabled={cursor === report.moves.length}
                className="p-2 rounded-xl bg-[#070709] border border-white/15 disabled:opacity-40 text-white"
                aria-label="End position"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>

            {/* Selected Move Explanation */}
            <div className="p-3 rounded-2xl bg-[#070709] border border-white/15 text-xs space-y-1">
              {activeMove && activeMeta ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading font-black text-white">
                      {activeMove.moveNumber}
                      {activeMove.color === 'w' ? '. ' : '... '}
                      {activeMove.san}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md border font-mono text-[11px] font-bold ${activeMeta.colorClass}`}
                    >
                      {activeMeta.badge} {activeMeta.label}
                    </span>
                  </div>
                  <p className="text-white/75 font-mono text-[11px]">{activeMove.note}</p>
                </>
              ) : (
                <p className="text-white/60 font-mono text-[11px]">
                  Starting Position • Tap Next ▶ or click any move to inspect Brilliant/Blunder ratings.
                </p>
              )}
            </div>
          </div>

          {/* Right: Accuracy + Counts Scorecard + Move List */}
          <div className="lg:col-span-6 space-y-4">
            {/* Player Accuracy Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-[#070709] border border-white/15 text-center space-y-1">
                <p className="text-xs font-heading font-bold text-white truncate">
                  ♔ {whiteAlias}
                </p>
                <p className="text-2xl font-mono font-black text-[#CCFF00]">
                  {report.whiteAccuracy}%
                </p>
                <p className="text-[10px] font-mono text-white/50 uppercase">Accuracy</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#070709] border border-white/15 text-center space-y-1">
                <p className="text-xs font-heading font-bold text-white truncate">
                  ♚ {blackAlias}
                </p>
                <p className="text-2xl font-mono font-black text-cyan-300">
                  {report.blackAccuracy}%
                </p>
                <p className="text-[10px] font-mono text-white/50 uppercase">Accuracy</p>
              </div>
            </div>

            {/* Brilliant / Great / Best / Blunder Breakdown Table */}
            <div className="bg-[#070709] border border-white/15 rounded-2xl p-3 space-y-1.5">
              {QUALITY_META.map((item) => (
                <div
                  key={item.key}
                  className="grid grid-cols-3 items-center text-xs font-mono py-1 border-b last:border-b-0 border-white/5"
                >
                  <span className="text-center font-bold text-white">
                    {report.whiteCounts[item.key]}
                  </span>
                  <span className={`text-center px-2 py-0.5 rounded border text-[11px] font-bold ${item.colorClass}`}>
                    {item.badge} {item.label}
                  </span>
                  <span className="text-center font-bold text-white">
                    {report.blackCounts[item.key]}
                  </span>
                </div>
              ))}
            </div>

            {/* Clickable Moves Feed */}
            <div className="bg-[#070709] border border-white/15 rounded-2xl p-3 max-h-[200px] overflow-y-auto">
              {report.moves.length === 0 ? (
                <p className="text-xs font-mono text-white/45 text-center py-4">
                  No moves played in this game.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                  {report.moves.map((m, idx) => {
                    const meta = QUALITY_META.find((q) => q.key === m.quality)!;
                    const isSelected = cursor === idx + 1;
                    return (
                      <button
                        key={m.ply}
                        type="button"
                        onClick={() => stepTo(idx + 1)}
                        className={`px-2 py-1 rounded-lg border text-[11px] flex items-center gap-1 transition-all ${
                          isSelected
                            ? 'border-[#CCFF00] ring-1 ring-[#CCFF00] bg-white/10 text-white'
                            : `${meta.colorClass} opacity-85 hover:opacity-100`
                        }`}
                      >
                        <span className="text-white/50">
                          {m.moveNumber}
                          {m.color === 'w' ? '.' : '...'}
                        </span>
                        <span className="font-bold">{m.san}</span>
                        <span>{meta.badge}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
