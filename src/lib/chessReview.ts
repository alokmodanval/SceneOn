import { Chess, Move, PieceSymbol } from 'chess.js';
import { PIECE_VALUES } from './chessHelpers';

export type MoveQuality =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'book'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface ReviewedMove {
  ply: number;
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  from: string;
  to: string;
  fenAfter: string;
  evalAfterWhiteCp: number; // From White's perspective (+ favors White)
  bestMoveSan: string;
  cpLoss: number;
  quality: MoveQuality;
  note: string;
}

export type QualityCounts = Record<MoveQuality, number>;

export interface GameReviewReport {
  moves: ReviewedMove[];
  startFen: string;
  whiteAccuracy: number;
  blackAccuracy: number;
  whiteCounts: QualityCounts;
  blackCounts: QualityCounts;
}

// Piece-square tables from White's point of view (row 0 = rank 8, row 7 = rank 1)
const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 27, 27, 10, 5, 5],
  [0, 0, 0, 24, 24, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -22, -22, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const KNIGHT_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 12, 15, 15, 12, 0, -30],
  [-30, 5, 15, 22, 22, 15, 5, -30],
  [-30, 0, 15, 22, 22, 15, 0, -30],
  [-30, 5, 12, 15, 15, 12, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const BISHOP_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 8, 12, 12, 8, 0, -10],
  [-10, 6, 6, 12, 12, 6, 6, -10],
  [-10, 0, 12, 12, 12, 12, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const ROOK_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [8, 12, 12, 12, 12, 12, 12, 8],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 4, 8, 8, 4, 0, 0],
];

const QUEEN_PST = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 6, 6, 6, 6, 0, -10],
  [-5, 0, 6, 6, 6, 6, 0, -5],
  [0, 0, 6, 6, 6, 6, 0, -5],
  [-10, 5, 6, 6, 6, 6, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];

const KING_PST = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 12, 0, 0, 12, 30, 20],
];

const PST_MAP: Record<PieceSymbol, number[][]> = {
  p: PAWN_PST,
  n: KNIGHT_PST,
  b: BISHOP_PST,
  r: ROOK_PST,
  q: QUEEN_PST,
  k: KING_PST,
};

function evaluateStaticWhiteCp(chess: Chess): number {
  if (chess.inCheck() && chess.isCheckmate()) {
    return chess.turn() === 'w' ? -50000 : 50000;
  }
  if (chess.isInsufficientMaterial() || chess.isThreefoldRepetition()) return 0;

  let total = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const base = PIECE_VALUES[piece.type] || 0;
      const pstRow = piece.color === 'w' ? r : 7 - r;
      const pst = PST_MAP[piece.type]?.[pstRow]?.[c] || 0;
      const val = base + pst;
      total += piece.color === 'w' ? val : -val;
    }
  }
  return total;
}

function orderMoves(moves: Move[]): Move[] {
  return moves.sort((a, b) => {
    const scoreA = (a.captured ? PIECE_VALUES[a.captured] * 4 - PIECE_VALUES[a.piece] : 0) + (a.promotion ? 900 : 0);
    const scoreB = (b.captured ? PIECE_VALUES[b.captured] * 4 - PIECE_VALUES[b.piece] : 0) + (b.promotion ? 900 : 0);
    return scoreB - scoreA;
  });
}

function quickStaticScoreForMover(chess: Chess): number {
  const whiteCp = evaluateStaticWhiteCp(chess);
  return chess.turn() === 'w' ? whiteCp : -whiteCp;
}

// Fast 1-ply Negamax + recapture extension on defended captures (<15ms/ply)
function negamax(chess: Chess, depth: number, alpha: number, beta: number, capturedSq: string | null = null): number {
  if (chess.inCheck() && chess.isCheckmate()) return -45000 - depth * 100;
  if (chess.isInsufficientMaterial() || chess.isThreefoldRepetition()) return 0;

  if (depth <= 0) {
    const standPat = quickStaticScoreForMover(chess);
    if (!capturedSq || !chess.isAttacked(capturedSq as Parameters<Chess['isAttacked']>[0], chess.turn())) {
      return standPat;
    }
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const atkMoves = orderMoves(
      chess.moves({ verbose: true }).filter((m) => m.to === capturedSq && Boolean(m.captured))
    ).slice(0, 2);
    let bestCap = standPat;
    for (const cap of atkMoves) {
      chess.move(cap);
      const val = -quickStaticScoreForMover(chess);
      chess.undo();
      if (val > bestCap) bestCap = val;
      if (val > alpha) alpha = val;
      if (alpha >= beta) break;
    }
    return bestCap;
  }

  const moves = orderMoves(chess.moves({ verbose: true }));
  if (moves.length === 0) return 0; // Stalemate
  let best = -Infinity;

  for (const mv of moves) {
    chess.move(mv);
    const score = -negamax(chess, depth - 1, -beta, -alpha, mv.captured ? mv.to : null);
    chess.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }

  return best;
}

function createEmptyCounts(): QualityCounts {
  return {
    brilliant: 0,
    great: 0,
    best: 0,
    book: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  };
}

function computeMoveAccuracy(cpLoss: number): number {
  const clamped = Math.max(0, Math.min(cpLoss, 600));
  const raw = 103.1668 * Math.exp(-0.04354 * (clamped / 10)) - 3.1668;
  return Math.max(5, Math.min(100, raw));
}

export function analyzeChessGame(pgn: string): GameReviewReport {
  const loader = new Chess();
  if (pgn.trim()) {
    try {
      loader.loadPgn(pgn);
    } catch {
      // Fallback empty
    }
  }
  const verboseMoves = loader.history({ verbose: true });
  const replay = new Chess();
  const startFen = replay.fen();

  const reviewed: ReviewedMove[] = [];
  const whiteCounts = createEmptyCounts();
  const blackCounts = createEmptyCounts();
  const whiteAccList: number[] = [];
  const blackAccList: number[] = [];

  for (let idx = 0; idx < verboseMoves.length; idx++) {
    const played = verboseMoves[idx];
    const moverColor = played.color;
    const legal = orderMoves(replay.moves({ verbose: true }));

    // Pre-rank root moves by 0-ply eval, always preserving forcing moves & the played move
    const ranked = legal.map((candidate) => {
      replay.move(candidate);
      let quick = 0;
      if (replay.isCheckmate()) quick = 48000;
      else if (replay.isDraw()) quick = 0;
      else {
        const wEval = evaluateStaticWhiteCp(replay);
        quick = moverColor === 'w' ? wEval : -wEval;
      }
      replay.undo();
      const isPlayed =
        candidate.from === played.from &&
        candidate.to === played.to &&
        candidate.promotion === played.promotion;
      const isForcing = Boolean(candidate.captured) || Boolean(candidate.promotion) || candidate.san.includes('+') || candidate.san.includes('#');
      return { candidate, quick, isPlayed, isForcing };
    });

    ranked.sort((a, b) => b.quick - a.quick);
    let extraAdded = 0;
    const shortlisted = ranked.filter((item, rIdx) => {
      if (rIdx < 5 || item.isPlayed) return true;
      if (item.isForcing && extraAdded < 4) {
        extraAdded += 1;
        return true;
      }
      return false;
    });

    // Evaluate shortlisted candidates with 1-ply Negamax + recapture check
    let bestScoreForMover = -Infinity;
    let secondBestScoreForMover = -Infinity;
    let bestMoveSan = played.san;
    let playedScoreForMover = 0;

    for (const { candidate, isPlayed } of shortlisted) {
      replay.move(candidate);
      const score = -negamax(replay, 1, -100000, 100000, candidate.captured ? candidate.to : null);
      replay.undo();

      if (isPlayed) {
        playedScoreForMover = score;
      }

      if (score > bestScoreForMover) {
        secondBestScoreForMover = bestScoreForMover;
        bestScoreForMover = score;
        bestMoveSan = candidate.san;
      } else if (score > secondBestScoreForMover) {
        secondBestScoreForMover = score;
      }
    }

    replay.move(played);
    const cpLoss = Math.max(0, Math.round(bestScoreForMover - playedScoreForMover));
    const evalAfterWhiteCp = moverColor === 'w' ? Math.round(playedScoreForMover) : Math.round(-playedScoreForMover);

    // Check if moved non-pawn piece landed on square attacked by enemy piece (sacrifice motif for Brilliant !!)
    let isSoundSacrifice = false;
    if (idx >= 4 && cpLoss <= 18 && played.piece !== 'p' && played.piece !== 'k' && playedScoreForMover >= 0) {
      const targetAttackers = replay.isAttacked(played.to, moverColor === 'w' ? 'b' : 'w');
      if (targetAttackers && (!played.captured || PIECE_VALUES[played.piece] > PIECE_VALUES[played.captured])) {
        isSoundSacrifice = true;
      }
    }

    let quality: MoveQuality;
    let note: string;

    if (idx < 4 && !played.captured && !played.san.includes('#') && !played.san.includes('+') && cpLoss <= 30) {
      quality = 'book';
      note = 'Standard opening theory.';
    } else if (isSoundSacrifice) {
      quality = 'brilliant';
      note = `${played.san} sacrifices material cleanly for a winning initiative!`;
    } else if (cpLoss === 0 && bestScoreForMover - secondBestScoreForMover >= 85 && idx >= 4) {
      quality = 'great';
      note = `${played.san} was the only critical move keeping the edge!`;
    } else if (cpLoss <= 15) {
      quality = 'best';
      note = `${played.san} is the top engine choice.`;
    } else if (cpLoss <= 45) {
      quality = 'good';
      note = `Solid move (${bestMoveSan} was slightly sharper).`;
    } else if (cpLoss <= 115) {
      quality = 'inaccuracy';
      note = `Minor slip (~${(cpLoss / 100).toFixed(1)}). ${bestMoveSan} was stronger.`;
    } else if (cpLoss <= 240) {
      quality = 'mistake';
      note = `Mistake (~${(cpLoss / 100).toFixed(1)} lost). Best was ${bestMoveSan}.`;
    } else {
      quality = 'blunder';
      note = `Blunder! Drops major advantage — ${bestMoveSan} was best.`;
    }

    const acc = computeMoveAccuracy(cpLoss);
    if (moverColor === 'w') {
      whiteCounts[quality] += 1;
      whiteAccList.push(acc);
    } else {
      blackCounts[quality] += 1;
      blackAccList.push(acc);
    }

    reviewed.push({
      ply: idx + 1,
      moveNumber: Math.floor(idx / 2) + 1,
      color: moverColor,
      san: played.san,
      from: played.from,
      to: played.to,
      fenAfter: replay.fen(),
      evalAfterWhiteCp,
      bestMoveSan,
      cpLoss,
      quality,
      note,
    });
  }

  const avg = (arr: number[]) =>
    arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 100;

  return {
    moves: reviewed,
    startFen,
    whiteAccuracy: avg(whiteAccList),
    blackAccuracy: avg(blackAccList),
    whiteCounts,
    blackCounts,
  };
}
