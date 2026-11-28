import { Chess, PieceSymbol } from 'chess.js';
import { getAudioContext } from './audioEngine';

export interface ChessTimeOption {
  label: string;
  ms: number;
  badge: string;
}

export const CHESS_TIME_OPTIONS: ChessTimeOption[] = [
  { label: '1 + 0', ms: 60000, badge: 'Bullet' },
  { label: '3 + 0', ms: 180000, badge: 'Blitz' },
  { label: '5 + 0', ms: 300000, badge: 'Rapid' },
  { label: '10 + 0', ms: 600000, badge: 'Classical' },
];

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Clean vector glyphs for crisp high-contrast rendering on all OS/mobile screens
export const CHESS_PIECE_SVGS: Record<PieceSymbol, string[]> = {
  k: [
    'M22.5 11.63V6M20 8h5',
    'M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5',
    'M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z',
    'M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0',
  ],
  q: [
    'M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z',
    'M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z',
    'M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0',
  ],
  r: [
    'M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5',
    'M34 14l-3 3H14l-3-3',
    'M31 17v12.5H14V17',
    'M31 29.5l1.5 2.5h-20l1.5-2.5',
    'M11 14h23',
  ],
  b: [
    'M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z',
    'M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z',
    'M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z',
    'M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5',
  ],
  n: [
    'M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21',
    'M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3',
  ],
  p: [
    'M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z',
  ],
};

export function loadChessGame(fen: string, pgn?: string): Chess {
  const game = new Chess();
  if (pgn) {
    try {
      game.loadPgn(pgn);
      if (game.fen() === fen) return game;
    } catch {
      // Fallback to FEN if PGN is empty or mismatched
    }
  }
  try {
    return new Chess(fen);
  } catch {
    return new Chess();
  }
}

export function formatChessClock(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (totalSeconds < 10 && clamped > 0) {
    const tenths = Math.floor((clamped % 1000) / 100);
    return `0:${secs.toString().padStart(2, '0')}.${tenths}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

let cachedNoiseBuffer: AudioBuffer | null = null;

function getWoodNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (cachedNoiseBuffer && cachedNoiseBuffer.sampleRate === ctx.sampleRate) {
    return cachedNoiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.04);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.008));
  }
  cachedNoiseBuffer = buffer;
  return buffer;
}

function scheduleWoodTap(
  ctx: AudioContext,
  startAt: number,
  params: { freqStart: number; freqEnd: number; dur: number; filterHz: number; gain: number }
) {
  // Warm wooden body resonance
  const osc = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(params.freqStart, startAt);
  osc.frequency.exponentialRampToValueAtTime(params.freqEnd, startAt + params.dur);
  bodyGain.gain.setValueAtTime(params.gain, startAt);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, startAt + params.dur);
  osc.connect(bodyGain);
  bodyGain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + params.dur + 0.01);

  // Short filtered wood-click transient
  const noise = ctx.createBufferSource();
  noise.buffer = getWoodNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(params.filterHz, startAt);
  filter.Q.setValueAtTime(2.2, startAt);
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(params.gain * 0.85, startAt);
  nGain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.025);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(ctx.destination);
  noise.start(startAt);
  noise.stop(startAt + 0.03);
}

export function playChessSound(
  kind: 'move' | 'opponent' | 'capture' | 'castle' | 'promote' | 'check' | 'gameover' | 'notify'
) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    if (kind === 'move') {
      scheduleWoodTap(ctx, now, { freqStart: 175, freqEnd: 74, dur: 0.045, filterHz: 1850, gain: 0.28 });
    } else if (kind === 'opponent') {
      scheduleWoodTap(ctx, now, { freqStart: 150, freqEnd: 66, dur: 0.042, filterHz: 1450, gain: 0.24 });
    } else if (kind === 'capture') {
      scheduleWoodTap(ctx, now, { freqStart: 245, freqEnd: 56, dur: 0.072, filterHz: 2350, gain: 0.36 });
    } else if (kind === 'castle') {
      // Classic two-step wooden tok-tok (King slide + Rook slide)
      scheduleWoodTap(ctx, now, { freqStart: 175, freqEnd: 75, dur: 0.04, filterHz: 1800, gain: 0.28 });
      scheduleWoodTap(ctx, now + 0.082, { freqStart: 195, freqEnd: 82, dur: 0.042, filterHz: 2050, gain: 0.3 });
    } else if (kind === 'promote') {
      scheduleWoodTap(ctx, now, { freqStart: 200, freqEnd: 80, dur: 0.05, filterHz: 1900, gain: 0.25 });
      [659.25, 987.77].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, now + i * 0.055);
        g.gain.setValueAtTime(0.14, now + i * 0.055);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.16);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(now + i * 0.055);
        o.stop(now + i * 0.055 + 0.17);
      });
    } else if (kind === 'check') {
      scheduleWoodTap(ctx, now, { freqStart: 210, freqEnd: 70, dur: 0.055, filterHz: 2200, gain: 0.28 });
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(920, now);
      o.frequency.exponentialRampToValueAtTime(1280, now + 0.12);
      g.gain.setValueAtTime(0.16, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now);
      o.stop(now + 0.16);
    } else {
      const notes = kind === 'gameover' ? [440, 554.37, 659.25] : [783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, now + idx * 0.08);
        g.gain.setValueAtTime(0.14, now + idx * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(now + idx * 0.08);
        o.stop(now + idx * 0.08 + 0.26);
      });
    }
  } catch {
    // Graceful fallback if audio context blocked
  }
}

export function playMoveAudio(
  mv: { san?: string; flags?: string; captured?: string } | null | undefined,
  inCheck: boolean,
  isSelf = true
) {
  if (inCheck) {
    playChessSound('check');
    return;
  }
  const san = mv?.san || '';
  const flags = mv?.flags || '';
  if (san.startsWith('O-O') || flags.includes('k') || flags.includes('q')) {
    playChessSound('castle');
    return;
  }
  if (flags.includes('p') || san.includes('=')) {
    playChessSound('promote');
    return;
  }
  if (mv?.captured || san.includes('x')) {
    playChessSound('capture');
    return;
  }
  playChessSound(isSelf ? 'move' : 'opponent');
}

export function computeMaterialSummary(fen: string): {
  capturedByWhite: PieceSymbol[];
  capturedByBlack: PieceSymbol[];
  advantageWhite: number;
} {
  const startCounts: Record<'w' | 'b', Record<PieceSymbol, number>> = {
    w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
    b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
  };
  const currentCounts: Record<'w' | 'b', Record<PieceSymbol, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };

  try {
    const chess = new Chess(fen);
    for (const row of chess.board()) {
      for (const sq of row) {
        if (sq) currentCounts[sq.color][sq.type] += 1;
      }
    }
  } catch {
    return { capturedByWhite: [], capturedByBlack: [], advantageWhite: 0 };
  }

  const order: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];
  const capturedByWhite: PieceSymbol[] = [];
  const capturedByBlack: PieceSymbol[] = [];
  let whitePts = 0;
  let blackPts = 0;

  for (const type of order) {
    whitePts += currentCounts.w[type] * (PIECE_VALUES[type] / 100);
    blackPts += currentCounts.b[type] * (PIECE_VALUES[type] / 100);
    const lostBlack = Math.max(0, startCounts.b[type] - currentCounts.b[type]);
    for (let i = 0; i < lostBlack; i++) capturedByWhite.push(type);
    const lostWhite = Math.max(0, startCounts.w[type] - currentCounts.w[type]);
    for (let i = 0; i < lostWhite; i++) capturedByBlack.push(type);
  }

  return {
    capturedByWhite,
    capturedByBlack,
    advantageWhite: Math.round(whitePts - blackPts),
  };
}

function evaluateBoardForSide(chess: Chess, side: 'w' | 'b'): number {
  if (chess.isCheckmate()) {
    return chess.turn() === side ? -99999 : 99999;
  }
  if (chess.isDraw()) return 0;

  let score = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const base = PIECE_VALUES[piece.type] || 0;
      // Subtle center bonus
      const centerDist = Math.abs(3.5 - r) + Math.abs(3.5 - c);
      const positional = piece.type === 'k' ? 0 : Math.round((7 - centerDist) * 8);
      const val = base + positional;
      score += piece.color === side ? val : -val;
    }
  }
  return score;
}

export function pickBotMove(fen: string): { from: string; to: string; promotion?: 'q' } | null {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return null;

    const botColor = chess.turn();
    let bestScore = -Infinity;
    let bestMoves: typeof moves = [];

    for (const mv of moves) {
      chess.move(mv);
      // 1-ply tactical evaluation minus opponent's best capture reply
      let score = evaluateBoardForSide(chess, botColor);
      if (!chess.isGameOver()) {
        const replies = chess.moves({ verbose: true });
        let maxCaptureLoss = 0;
        for (const rep of replies) {
          if (rep.captured) {
            const capVal = PIECE_VALUES[rep.captured] - PIECE_VALUES[rep.piece] * 0.2;
            if (capVal > maxCaptureLoss) maxCaptureLoss = capVal;
          }
        }
        score -= maxCaptureLoss * 0.65;
        if (chess.inCheck()) score += 45;
      }
      chess.undo();

      if (score > bestScore) {
        bestScore = score;
        bestMoves = [mv];
      } else if (Math.abs(score - bestScore) <= 15) {
        bestMoves.push(mv);
      }
    }

    const chosen = bestMoves[Math.floor(Math.random() * bestMoves.length)] || moves[0];
    return {
      from: chosen.from,
      to: chosen.to,
      promotion: chosen.promotion ? 'q' : undefined,
    };
  } catch {
    return null;
  }
}
