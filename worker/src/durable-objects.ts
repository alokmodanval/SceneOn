import { DurableObject } from 'cloudflare:workers';
import { Chess } from 'chess.js';

interface SocketAttachment {
  userId: string;
  alias: string;
  mode?: string;
  gameId?: string;
}

type SpeedQueueRow = {
  user_id: string;
  user_json: string;
  joined_at: number;
};

type ChessQueueRow = {
  user_id: string;
  user_json: string;
  time_control_ms: number;
  joined_at: number;
};

type ChessStateRow = {
  fen: string;
  pgn: string;
  status: 'waiting' | 'active' | 'checkmate' | 'draw' | 'resigned' | 'timeout';
  winner: 'w' | 'b' | 'draw' | null;
  turn: 'w' | 'b';
  white_json: string | null;
  black_json: string | null;
  time_control_ms: number;
  white_time_ms: number;
  black_time_ms: number;
  last_move_at: number | null;
  last_move_json: string | null;
  draw_offer_by: 'w' | 'b' | null;
  move_count: number;
  game_id: string;
  round_num: number;
  saved_round: number;
  created_at: string;
};

type StoredPlayer = {
  id: string;
  alias: string;
  username?: string;
  avatar?: unknown;
};

const CODENAMES = [
  { name: 'Mystic Falcon', emoji: '🦅' },
  { name: 'Neon Chai', emoji: '☕' },
  { name: 'Cyber Panda', emoji: '🐼' },
  { name: 'Midnight Glitch', emoji: '⚡' },
  { name: 'Cosmic LoFi', emoji: '🌙' },
  { name: 'Desi Samurai', emoji: '🗡️' },
  { name: 'Vibe Alchemist', emoji: '✨' },
  { name: 'Shadow Hacker', emoji: '🕶️' },
];

const DEBATE_TOPICS = [
  'Is ghosting ever justified, or is it pure emotional cowardice?',
  'Are situationships just people wanting relationship benefits without accountability?',
  'What is your biggest green flag that people rarely notice at first?',
  'Would you delete Instagram permanently for ₹5 Lakhs cash right now?',
  'Dating in college vs dating after placement: which one is more cooked?',
  'What is the most chaotic late-night spontaneous plan you ever pulled off?',
];

export class LobbyHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS speed_queue (
          user_id TEXT PRIMARY KEY,
          user_json TEXT NOT NULL,
          joined_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chess_queue (
          user_id TEXT PRIMARY KEY,
          user_json TEXT NOT NULL,
          time_control_ms INTEGER NOT NULL,
          joined_at INTEGER NOT NULL
        );
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const url = new URL(request.url);
    const userId = (url.searchParams.get('userId') || `anon_${crypto.randomUUID().slice(0, 8)}`).slice(0, 64);
    const alias = (url.searchParams.get('alias') || 'ChessPlayer').slice(0, 32);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, alias } satisfies SocketAttachment);

    this.broadcastOnlinePresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  async broadcastLobbyEvent(event: Record<string, unknown>): Promise<void> {
    const payload = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // Ignore stale closing socket
      }
    }
  }

  async sendToUser(targetUserId: string, event: Record<string, unknown>): Promise<boolean> {
    const payload = JSON.stringify(event);
    let delivered = false;
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment() as SocketAttachment | null;
      if (meta?.userId === targetUserId) {
        try {
          ws.send(payload);
          delivered = true;
        } catch {
          // Ignore stale closing socket
        }
      }
    }
    return delivered;
  }

  private getActiveUserIds(): string[] {
    const ids = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment() as SocketAttachment | null;
      if (meta?.userId) ids.add(meta.userId);
    }
    return Array.from(ids);
  }

  private broadcastOnlinePresence(): void {
    const activeUserIds = this.getActiveUserIds();
    const payload = JSON.stringify({
      type: 'presence_update',
      onlineCount: activeUserIds.length,
      onlineUserIds: activeUserIds,
    });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // Ignore stale socket
      }
    }
  }

  private findSocketByUserId(userId: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment() as SocketAttachment | null;
      if (meta?.userId === userId) return ws;
    }
    return null;
  }

  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    if (typeof rawMessage !== 'string' || rawMessage.length > 16384) return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(rawMessage) as Record<string, unknown>;
    } catch {
      return;
    }

    const meta = (ws.deserializeAttachment() as SocketAttachment | null) || {
      userId: 'anon',
      alias: 'Peer',
    };
    const now = Date.now();

    if (msg.type === 'ping') {
      const onlineUserIds = this.getActiveUserIds();
      ws.send(JSON.stringify({ type: 'pong', onlineCount: onlineUserIds.length, onlineUserIds }));
      return;
    }

    if (msg.type === 'speed_queue_leave') {
      this.ctx.storage.sql.exec('DELETE FROM speed_queue WHERE user_id = ?', meta.userId);
      return;
    }

    if (msg.type === 'speed_queue_join' && msg.user && typeof msg.user === 'object') {
      this.ctx.storage.sql.exec('DELETE FROM speed_queue WHERE joined_at < ?', now - 60000);

      const waiting = this.ctx.storage.sql
        .exec<SpeedQueueRow>('SELECT * FROM speed_queue WHERE user_id != ? ORDER BY joined_at ASC', meta.userId)
        .toArray();

      let matchedPartner: { row: SpeedQueueRow; socket: WebSocket } | null = null;
      for (const row of waiting) {
        const partnerWs = this.findSocketByUserId(row.user_id);
        if (partnerWs) {
          matchedPartner = { row, socket: partnerWs };
          break;
        }
        this.ctx.storage.sql.exec('DELETE FROM speed_queue WHERE user_id = ?', row.user_id);
      }

      if (matchedPartner) {
        this.ctx.storage.sql.exec(
          'DELETE FROM speed_queue WHERE user_id IN (?, ?)',
          meta.userId,
          matchedPartner.row.user_id
        );

        const sessionId = `spd_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const maskA = CODENAMES[Math.floor(Math.random() * CODENAMES.length)];
        let maskB = CODENAMES[Math.floor(Math.random() * CODENAMES.length)];
        if (maskB.name === maskA.name) {
          maskB = CODENAMES[(CODENAMES.indexOf(maskA) + 1) % CODENAMES.length];
        }
        const topic = DEBATE_TOPICS[Math.floor(Math.random() * DEBATE_TOPICS.length)];
        const partnerUser = JSON.parse(matchedPartner.row.user_json) as Record<string, unknown>;

        ws.send(
          JSON.stringify({
            type: 'speed_matched',
            sessionId,
            partner: partnerUser,
            maskedAlias: maskB.name,
            maskedEmoji: maskB.emoji,
            topic,
          })
        );

        matchedPartner.socket.send(
          JSON.stringify({
            type: 'speed_matched',
            sessionId,
            partner: msg.user,
            maskedAlias: maskA.name,
            maskedEmoji: maskA.emoji,
            topic,
          })
        );
      } else {
        this.ctx.storage.sql.exec(
          'INSERT OR REPLACE INTO speed_queue (user_id, user_json, joined_at) VALUES (?, ?, ?)',
          meta.userId,
          JSON.stringify(msg.user).slice(0, 4096),
          now
        );
        ws.send(JSON.stringify({ type: 'speed_queued' }));
      }
      return;
    }

    if (msg.type === 'chess_queue_leave') {
      this.ctx.storage.sql.exec('DELETE FROM chess_queue WHERE user_id = ?', meta.userId);
      return;
    }

    if (msg.type === 'chess_queue_join' && msg.user && typeof msg.user === 'object') {
      this.ctx.storage.sql.exec('DELETE FROM chess_queue WHERE joined_at < ?', now - 90000);
      const timeControlMs =
        typeof msg.timeControlMs === 'number' && msg.timeControlMs >= 60000 && msg.timeControlMs <= 1800000
          ? msg.timeControlMs
          : 300000;

      const waiting = this.ctx.storage.sql
        .exec<ChessQueueRow>('SELECT * FROM chess_queue WHERE user_id != ? ORDER BY joined_at ASC', meta.userId)
        .toArray();

      let matched: { row: ChessQueueRow; socket: WebSocket } | null = null;
      for (const row of waiting) {
        const opponentWs = this.findSocketByUserId(row.user_id);
        if (opponentWs) {
          matched = { row, socket: opponentWs };
          break;
        }
        this.ctx.storage.sql.exec('DELETE FROM chess_queue WHERE user_id = ?', row.user_id);
      }

      if (matched) {
        this.ctx.storage.sql.exec(
          'DELETE FROM chess_queue WHERE user_id IN (?, ?)',
          meta.userId,
          matched.row.user_id
        );
        const gameId = `chess_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
        const firstUser = JSON.parse(matched.row.user_json) as Record<string, unknown>;
        const chosenTimeMs = matched.row.time_control_ms || timeControlMs;

        matched.socket.send(
          JSON.stringify({
            type: 'chess_matched',
            gameId,
            color: 'w',
            timeControlMs: chosenTimeMs,
            opponent: msg.user,
          })
        );
        ws.send(
          JSON.stringify({
            type: 'chess_matched',
            gameId,
            color: 'b',
            timeControlMs: chosenTimeMs,
            opponent: firstUser,
          })
        );
      } else {
        this.ctx.storage.sql.exec(
          'INSERT OR REPLACE INTO chess_queue (user_id, user_json, time_control_ms, joined_at) VALUES (?, ?, ?, ?)',
          meta.userId,
          JSON.stringify(msg.user).slice(0, 4096),
          timeControlMs,
          now
        );
        ws.send(JSON.stringify({ type: 'chess_queued' }));
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const meta = ws.deserializeAttachment() as SocketAttachment | null;
    if (meta?.userId && !this.findSocketByUserId(meta.userId)) {
      this.ctx.storage.sql.exec('DELETE FROM speed_queue WHERE user_id = ?', meta.userId);
      this.ctx.storage.sql.exec('DELETE FROM chess_queue WHERE user_id = ?', meta.userId);
    }
    this.broadcastOnlinePresence();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }
}

export class RoomRelay extends DurableObject<Env> {
  private cachedChess: Chess | null = null;
  private cachedFen = '';
  private cachedRound = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS chess_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          fen TEXT NOT NULL,
          pgn TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'waiting',
          winner TEXT,
          turn TEXT NOT NULL DEFAULT 'w',
          white_json TEXT,
          black_json TEXT,
          time_control_ms INTEGER NOT NULL DEFAULT 300000,
          white_time_ms INTEGER NOT NULL DEFAULT 300000,
          black_time_ms INTEGER NOT NULL DEFAULT 300000,
          last_move_at INTEGER,
          last_move_json TEXT,
          draw_offer_by TEXT,
          move_count INTEGER NOT NULL DEFAULT 0,
          game_id TEXT NOT NULL DEFAULT '',
          round_num INTEGER NOT NULL DEFAULT 1,
          saved_round INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT ''
        );
      `);
      // Backwards-compatible column migration for already-initialized DO SQLite instances
      const cols = this.ctx.storage.sql
        .exec<{ name: string }>('PRAGMA table_info(chess_state)')
        .toArray()
        .map((c) => c.name);
      if (!cols.includes('game_id')) {
        this.ctx.storage.sql.exec("ALTER TABLE chess_state ADD COLUMN game_id TEXT NOT NULL DEFAULT ''");
      }
      if (!cols.includes('round_num')) {
        this.ctx.storage.sql.exec('ALTER TABLE chess_state ADD COLUMN round_num INTEGER NOT NULL DEFAULT 1');
      }
      if (!cols.includes('saved_round')) {
        this.ctx.storage.sql.exec('ALTER TABLE chess_state ADD COLUMN saved_round INTEGER NOT NULL DEFAULT 0');
      }
      if (!cols.includes('created_at')) {
        this.ctx.storage.sql.exec("ALTER TABLE chess_state ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const url = new URL(request.url);
    const userId = (url.searchParams.get('userId') || `anon_${crypto.randomUUID().slice(0, 8)}`).slice(0, 64);
    const alias = (url.searchParams.get('alias') || 'ChessPlayer').slice(0, 32);
    const mode = url.searchParams.get('mode') || 'room';
    const gameId = url.searchParams.get('gameId') || '';

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, alias, mode, gameId } satisfies SocketAttachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  async relayEvent(payload: Record<string, unknown>, excludeUserId?: string): Promise<void> {
    const serialized = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment() as SocketAttachment | null;
      if (excludeUserId && meta?.userId === excludeUserId) continue;
      try {
        ws.send(serialized);
      } catch {
        // Ignore closing socket
      }
    }
  }

  private getOrInitChessState(defaultTimeMs = 300000, gameId = ''): ChessStateRow {
    const rows = this.ctx.storage.sql
      .exec<ChessStateRow>('SELECT * FROM chess_state WHERE id = 1')
      .toArray();
    if (rows.length > 0) {
      const existing = rows[0];
      if (!existing.game_id && gameId) {
        existing.game_id = gameId;
        this.saveChessState(existing);
      }
      return existing;
    }

    const startFen = new Chess().fen();
    const nowIso = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO chess_state (
        id, fen, pgn, status, winner, turn, white_json, black_json,
        time_control_ms, white_time_ms, black_time_ms, last_move_at, last_move_json,
        draw_offer_by, move_count, game_id, round_num, saved_round, created_at
      ) VALUES (1, ?, '', 'waiting', NULL, 'w', NULL, NULL, ?, ?, ?, NULL, NULL, NULL, 0, ?, 1, 0, ?)`,
      startFen,
      defaultTimeMs,
      defaultTimeMs,
      defaultTimeMs,
      gameId,
      nowIso
    );
    return this.ctx.storage.sql.exec<ChessStateRow>('SELECT * FROM chess_state WHERE id = 1').one();
  }

  private saveChessState(state: ChessStateRow): void {
    this.ctx.storage.sql.exec(
      `UPDATE chess_state SET
        fen = ?, pgn = ?, status = ?, winner = ?, turn = ?,
        white_json = ?, black_json = ?, time_control_ms = ?,
        white_time_ms = ?, black_time_ms = ?, last_move_at = ?,
        last_move_json = ?, draw_offer_by = ?, move_count = ?,
        game_id = ?, round_num = ?, saved_round = ?, created_at = ?
      WHERE id = 1`,
      state.fen,
      state.pgn,
      state.status,
      state.winner,
      state.turn,
      state.white_json,
      state.black_json,
      state.time_control_ms,
      state.white_time_ms,
      state.black_time_ms,
      state.last_move_at,
      state.last_move_json,
      state.draw_offer_by,
      state.move_count,
      state.game_id,
      state.round_num,
      state.saved_round,
      state.created_at
    );
  }

  private persistCompletedGameIfNeeded(state: ChessStateRow, fallbackGameId?: string): void {
    const isFinished =
      state.status === 'checkmate' ||
      state.status === 'draw' ||
      state.status === 'resigned' ||
      state.status === 'timeout';
    if (!isFinished || state.saved_round >= state.round_num) return;

    const white = state.white_json ? (JSON.parse(state.white_json) as StoredPlayer) : null;
    const black = state.black_json ? (JSON.parse(state.black_json) as StoredPlayer) : null;
    if (!white || !black) return;

    const resolvedGameId = state.game_id || fallbackGameId || `chess_${crypto.randomUUID().slice(0, 8)}`;
    const recordId = `${resolvedGameId}_r${state.round_num}`;
    state.saved_round = state.round_num;
    this.saveChessState(state);

    const endedAt = new Date().toISOString();
    const createdAt = state.created_at || endedAt;

    this.ctx.waitUntil(
      (async () => {
        try {
          await this.env.DB.prepare(
            `INSERT OR IGNORE INTO chess_games (
              id, time_control_ms, status, winner_side,
              white_id, white_alias, white_username, white_avatar_json,
              black_id, black_alias, black_username, black_avatar_json,
              pgn, fen, move_count, created_at, ended_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              recordId,
              state.time_control_ms,
              state.status,
              state.winner,
              white.id,
              white.alias,
              white.username || '',
              JSON.stringify(white.avatar || {}),
              black.id,
              black.alias,
              black.username || '',
              JSON.stringify(black.avatar || {}),
              state.pgn || '',
              state.fen,
              state.move_count,
              createdAt,
              endedAt
            )
            .run();

          if (state.winner === 'w') {
            await this.env.DB.batch([
              this.env.DB.prepare('UPDATE scene_users SET wins = wins + 1 WHERE id = ?').bind(white.id),
              this.env.DB.prepare('UPDATE scene_users SET losses = losses + 1 WHERE id = ?').bind(black.id),
            ]);
          } else if (state.winner === 'b') {
            await this.env.DB.batch([
              this.env.DB.prepare('UPDATE scene_users SET wins = wins + 1 WHERE id = ?').bind(black.id),
              this.env.DB.prepare('UPDATE scene_users SET losses = losses + 1 WHERE id = ?').bind(white.id),
            ]);
          } else if (state.winner === 'draw') {
            await this.env.DB.batch([
              this.env.DB.prepare('UPDATE scene_users SET draws = draws + 1 WHERE id = ?').bind(white.id),
              this.env.DB.prepare('UPDATE scene_users SET draws = draws + 1 WHERE id = ?').bind(black.id),
            ]);
          }

          const hub = this.env.LOBBY_HUB.getByName('global-lobby');
          await Promise.all([
            hub.sendToUser(white.id, { type: 'history_updated', gameId: recordId }),
            hub.sendToUser(black.id, { type: 'history_updated', gameId: recordId }),
          ]);
        } catch (err) {
          console.error('Failed to persist completed chess game to D1:', err);
        }
      })()
    );
  }

  private formatChessSyncPayload(state: ChessStateRow) {
    return {
      type: 'chess_sync',
      state: {
        fen: state.fen,
        pgn: state.pgn,
        status: state.status,
        winner: state.winner,
        turn: state.turn,
        white: state.white_json ? JSON.parse(state.white_json) : null,
        black: state.black_json ? JSON.parse(state.black_json) : null,
        timeControlMs: state.time_control_ms,
        whiteTimeMs: state.white_time_ms,
        blackTimeMs: state.black_time_ms,
        lastMoveAt: state.last_move_at,
        lastMove: state.last_move_json ? JSON.parse(state.last_move_json) : null,
        drawOfferBy: state.draw_offer_by,
        moveCount: state.move_count,
      },
    };
  }

  private broadcastToAll(payload: unknown): void {
    const text = JSON.stringify(payload);
    for (const client of this.ctx.getWebSockets()) {
      try {
        client.send(text);
      } catch {
        // Ignore broken sockets
      }
    }
  }

  private broadcastToOthers(sender: WebSocket, rawMessage: string): void {
    for (const client of this.ctx.getWebSockets()) {
      if (client === sender) continue;
      try {
        client.send(rawMessage);
      } catch {
        // Ignore broken sockets
      }
    }
  }

  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    if (typeof rawMessage !== 'string' || rawMessage.length > 32768) return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(rawMessage) as Record<string, unknown>;
    } catch {
      return;
    }

    const msgType = typeof msg.type === 'string' ? msg.type : '';
    const meta = ws.deserializeAttachment() as SocketAttachment | null;
    const senderId = meta?.userId || '';

    if (msgType.startsWith('chess_')) {
      const requestedTime =
        typeof msg.timeControlMs === 'number' && msg.timeControlMs >= 60000
          ? msg.timeControlMs
          : 300000;
      const state = this.getOrInitChessState(requestedTime, meta?.gameId || '');
      const now = Date.now();

      const rawPlayer = msg.player || msg.user;
      if (msgType === 'chess_join' && rawPlayer && typeof rawPlayer === 'object') {
        const player = rawPlayer as StoredPlayer;
        const white = state.white_json ? (JSON.parse(state.white_json) as StoredPlayer) : null;
        const black = state.black_json ? (JSON.parse(state.black_json) as StoredPlayer) : null;

        const preferred = msg.preferredColor === 'w' || msg.preferredColor === 'b' ? msg.preferredColor : null;
        if (white?.id !== player.id && black?.id !== player.id) {
          if (preferred === 'w' && !white) {
            state.white_json = JSON.stringify(player);
          } else if (preferred === 'b' && !black) {
            state.black_json = JSON.stringify(player);
          } else if (!white) {
            state.white_json = JSON.stringify(player);
          } else if (!black) {
            state.black_json = JSON.stringify(player);
          }
        }

        if (state.white_json && state.black_json && state.status === 'waiting') {
          state.status = 'active';
          state.last_move_at = now;
        }
        this.saveChessState(state);
        this.broadcastToAll(this.formatChessSyncPayload(state));
        return;
      }

      if (msgType === 'chess_move') {
        if (state.status !== 'active' && state.status !== 'waiting') return;

        const white = state.white_json ? (JSON.parse(state.white_json) as StoredPlayer) : null;
        const black = state.black_json ? (JSON.parse(state.black_json) as StoredPlayer) : null;

        if (state.turn === 'w' && white && white.id !== senderId) return;
        if (state.turn === 'b' && black && black.id !== senderId) return;

        let chess: Chess;
        if (this.cachedChess && this.cachedFen === state.fen && this.cachedRound === state.round_num) {
          chess = this.cachedChess;
        } else {
          chess = new Chess();
          if (state.pgn) {
            try {
              chess.loadPgn(state.pgn);
            } catch {
              chess = new Chess(state.fen);
            }
          }
          if (chess.fen() !== state.fen) {
            chess = new Chess(state.fen);
          }
        }

        const from = typeof msg.from === 'string' ? msg.from : '';
        const to = typeof msg.to === 'string' ? msg.to : '';
        const promotion =
          msg.promotion === 'q' || msg.promotion === 'r' || msg.promotion === 'b' || msg.promotion === 'n'
            ? msg.promotion
            : 'q';

        try {
          const move = chess.move({ from, to, promotion });
          if (!move) return;

          if (state.last_move_at && state.move_count > 0) {
            const elapsed = Math.max(0, now - state.last_move_at);
            if (state.turn === 'w') {
              state.white_time_ms = Math.max(0, state.white_time_ms - elapsed);
            } else {
              state.black_time_ms = Math.max(0, state.black_time_ms - elapsed);
            }
          }

          state.fen = chess.fen();
          state.pgn = chess.pgn();
          state.turn = chess.turn();
          state.last_move_at = now;
          state.last_move_json = JSON.stringify({ from: move.from, to: move.to, san: move.san });
          state.draw_offer_by = null;
          state.move_count += 1;
          state.status = 'active';

          if (chess.isCheckmate()) {
            state.status = 'checkmate';
            state.winner = move.color;
          } else if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
            state.status = 'draw';
            state.winner = 'draw';
          }

          this.cachedChess = chess;
          this.cachedFen = state.fen;
          this.cachedRound = state.round_num;

          // Flush WebSocket sync to opponent BEFORE disk SQLite write to cut relay latency
          this.broadcastToAll(this.formatChessSyncPayload(state));
          this.saveChessState(state);
          this.persistCompletedGameIfNeeded(state, meta?.gameId);
        } catch {
          this.cachedChess = null;
          // Illegal move ignored safely
        }
        return;
      }

      if (msgType === 'chess_resign' && (state.status === 'active' || state.status === 'waiting')) {
        const white = state.white_json ? (JSON.parse(state.white_json) as StoredPlayer) : null;
        const black = state.black_json ? (JSON.parse(state.black_json) as StoredPlayer) : null;
        if (white?.id === senderId) {
          state.status = 'resigned';
          state.winner = 'b';
        } else if (black?.id === senderId) {
          state.status = 'resigned';
          state.winner = 'w';
        } else {
          return;
        }
        this.broadcastToAll(this.formatChessSyncPayload(state));
        this.saveChessState(state);
        this.persistCompletedGameIfNeeded(state, meta?.gameId);
        return;
      }

      if (msgType === 'chess_timeout' && state.status === 'active') {
        const loser = msg.color === 'w' ? 'w' : msg.color === 'b' ? 'b' : state.turn;
        state.status = 'timeout';
        state.winner = loser === 'w' ? 'b' : 'w';
        if (loser === 'w') state.white_time_ms = 0;
        else state.black_time_ms = 0;
        this.broadcastToAll(this.formatChessSyncPayload(state));
        this.saveChessState(state);
        this.persistCompletedGameIfNeeded(state, meta?.gameId);
        return;
      }

      if (msgType === 'chess_draw_offer' && state.status === 'active') {
        const white = state.white_json ? (JSON.parse(state.white_json) as StoredPlayer) : null;
        const black = state.black_json ? (JSON.parse(state.black_json) as StoredPlayer) : null;
        if (white?.id === senderId) state.draw_offer_by = 'w';
        else if (black?.id === senderId) state.draw_offer_by = 'b';
        else return;
        this.broadcastToAll(this.formatChessSyncPayload(state));
        this.saveChessState(state);
        return;
      }

      if (msgType === 'chess_draw_accept' && state.status === 'active' && state.draw_offer_by) {
        state.status = 'draw';
        state.winner = 'draw';
        state.draw_offer_by = null;
        this.broadcastToAll(this.formatChessSyncPayload(state));
        this.saveChessState(state);
        this.persistCompletedGameIfNeeded(state, meta?.gameId);
        return;
      }

      if (msgType === 'chess_rematch') {
        const prevWhite = state.white_json;
        const prevBlack = state.black_json;
        const startFen = new Chess().fen();
        state.fen = startFen;
        state.pgn = '';
        state.turn = 'w';
        state.winner = null;
        state.white_json = prevBlack || prevWhite;
        state.black_json = prevBlack ? prevWhite : null;
        state.status = state.white_json && state.black_json ? 'active' : 'waiting';
        state.white_time_ms = state.time_control_ms;
        state.black_time_ms = state.time_control_ms;
        state.last_move_at = now;
        state.last_move_json = null;
        state.draw_offer_by = null;
        state.move_count = 0;
        state.round_num += 1;
        state.created_at = new Date().toISOString();
        this.cachedChess = null;
        this.cachedFen = '';
        this.cachedRound = state.round_num;
        this.broadcastToAll(this.formatChessSyncPayload(state));
        this.saveChessState(state);
        return;
      }
      return;
    }

    this.broadcastToOthers(ws, rawMessage);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const meta = ws.deserializeAttachment() as SocketAttachment | null;
    if (meta?.userId) {
      this.broadcastToOthers(
        ws,
        JSON.stringify({
          type: 'leave',
          userId: meta.userId,
          peerId: '',
        })
      );
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }
}
