import { handleAiChatRequest } from '../../functions/api/ai-chat.ts';
export { LobbyHub, RoomRelay } from './durable-objects.ts';

interface UserRow {
  id: string;
  scene_key: string;
  alias: string;
  avatar_json: string;
  tags_json: string;
  sliders_json: string;
  scene_prompt: string;
  scene_aura: number;
  is_online: number;
  last_seen: string;
  created_at: string;
}

interface RoomRow {
  id: string;
  title: string;
  vibe_tag: string;
  participants_json: string;
  max_users: number;
  active_topic: string;
  kick_votes_json: string;
  is_private: number;
  room_pin: string | null;
  host_id: string | null;
  locked_seats_json: string;
  created_at: string;
}

interface ChatRow {
  id: string;
  user_1: string;
  user_2: string;
  msg_count_1: number;
  msg_count_2: number;
  socials_shared_json: string;
  created_at: string;
}

interface MessageRow {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string;
  msg_type: string;
  created_at: string;
}

const DEFAULT_STARTER_ROOMS = [
  {
    id: 'room-1',
    title: '☕ Late Night Tapri',
    vibe_tag: '☕ Chai & Bakchodi',
    active_topic: 'Hostel vs Home food: Which one humbled you more?',
  },
  {
    id: 'room-2',
    title: '💻 Coders & Builders Lounge',
    vibe_tag: '💻 Coding & Dev',
    active_topic: 'What project did you abandon halfway through this month?',
  },
  {
    id: 'room-3',
    title: '🎧 Lo-Fi & Music Jam',
    vibe_tag: '🎵 Lo-Fi & Indie',
    active_topic: 'What is that one song you will never skip no matter what?',
  },
  {
    id: 'room-4',
    title: '📚 Silent Study Pod',
    vibe_tag: '📚 Exam / Placement Grind',
    active_topic: 'Share 1 tip that keeps you focused during late-night sprints.',
  },
  {
    id: 'room-5',
    title: '🔥 3AM Unfiltered Rants',
    vibe_tag: '🌙 3AM Rants',
    active_topic: 'What is a popular trend right now that makes zero sense to you?',
  },
];

function getCorsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin') || '';
  const allowedBase = env.ALLOWED_ORIGIN || 'https://friendsclub.tools4genz.com';
  const isAllowed =
    origin === allowedBase ||
    origin.endsWith('.friendsclub-88t.pages.dev') ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:');

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedBase,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(
  request: Request,
  env: Env,
  body: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...getCorsHeaders(request, env),
    },
  });
}

function mapUserRow(row: UserRow) {
  return {
    id: row.id,
    scene_key: row.scene_key,
    alias: row.alias,
    avatar: JSON.parse(row.avatar_json),
    tags: JSON.parse(row.tags_json),
    sliders: JSON.parse(row.sliders_json),
    scene_prompt: row.scene_prompt,
    scene_aura: row.scene_aura,
    is_online: Boolean(row.is_online),
    last_seen: row.last_seen,
    created_at: row.created_at,
  };
}

function mapRoomRow(row: RoomRow, requesterId?: string | null) {
  const showPin = Boolean(requesterId && row.host_id && requesterId === row.host_id);
  return {
    id: row.id,
    title: row.title,
    vibe_tag: row.vibe_tag,
    participants: JSON.parse(row.participants_json || '[]'),
    max_users: row.max_users,
    active_topic: row.active_topic,
    kick_votes: JSON.parse(row.kick_votes_json || '{}'),
    is_private: Boolean(row.is_private),
    room_pin: showPin ? row.room_pin || undefined : undefined,
    has_pin: Boolean(row.is_private && row.room_pin),
    host_id: row.host_id || undefined,
    locked_seats: JSON.parse(row.locked_seats_json || '[]'),
    created_at: row.created_at,
  };
}

function mapChatRow(row: ChatRow) {
  return {
    id: row.id,
    user_1: row.user_1,
    user_2: row.user_2,
    msg_count_1: row.msg_count_1,
    msg_count_2: row.msg_count_2,
    socials_shared: JSON.parse(row.socials_shared_json || '{}'),
    created_at: row.created_at,
  };
}

async function ensureStarterRooms(db: D1Database): Promise<void> {
  const existing = await db.prepare('SELECT COUNT(*) as cnt FROM scene_rooms').first<{ cnt: number }>();
  if ((existing?.cnt || 0) > 0) return;

  const now = new Date().toISOString();
  const stmts = DEFAULT_STARTER_ROOMS.map((r) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO scene_rooms (id, title, vibe_tag, participants_json, max_users, active_topic, kick_votes_json, is_private, locked_seats_json, created_at)
         VALUES (?, ?, ?, '[]', 6, ?, '{}', 0, '[]', ?)`
      )
      .bind(r.id, r.title, r.vibe_tag, r.active_topic, now)
  );
  await db.batch(stmts);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 1. WebSocket Routing to Durable Objects
      if (path === '/ws/lobby') {
        const stub = env.LOBBY_HUB.getByName('global-lobby');
        return stub.fetch(request);
      }

      if (path.startsWith('/ws/room/') || path.startsWith('/ws/chess/')) {
        const segments = path.split('/').filter(Boolean);
        const roomKey = `${segments[1]}_${segments[2] || 'default'}`;
        const stub = env.ROOM_RELAY.getByName(roomKey);
        return stub.fetch(request);
      }

      // 2. Health check
      if (path === '/api/health' && request.method === 'GET') {
        const [usersCount, roomsCount] = await Promise.all([
          env.DB.prepare('SELECT COUNT(*) as cnt FROM scene_users').first<{ cnt: number }>(),
          env.DB.prepare('SELECT COUNT(*) as cnt FROM scene_rooms').first<{ cnt: number }>(),
        ]);
        return jsonResponse(request, env, {
          ok: true,
          backend: 'cloudflare-d1-do',
          users: usersCount?.cnt || 0,
          rooms: roomsCount?.cnt || 0,
        });
      }

      // 3. Groq AI Chat Proxy
      if (path === '/api/ai-chat' && request.method === 'POST') {
        const rawText = await request.text();
        if (rawText.length > 32768) {
          return jsonResponse(request, env, { error: 'Payload too large' }, 413);
        }
        const parsed = JSON.parse(rawText || '{}') as unknown;
        const workerEnv = env as Env & { GROQ_API_KEY?: string };
        const result = await handleAiChatRequest(parsed, workerEnv.GROQ_API_KEY || '');
        return jsonResponse(request, env, result.data, result.status);
      }

      // 4. Users Endpoints
      if (path === '/api/users' && request.method === 'GET') {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const rows = await env.DB.prepare(
          'SELECT * FROM scene_users WHERE last_seen >= ? ORDER BY last_seen DESC LIMIT 100'
        )
          .bind(cutoff)
          .all<UserRow>();
        return jsonResponse(request, env, {
          users: (rows.results || []).map(mapUserRow),
        });
      }

      if (path === '/api/users' && request.method === 'POST') {
        const body = (await request.json()) as Record<string, unknown>;
        const id = typeof body.id === 'string' ? body.id.trim().slice(0, 64) : '';
        const sceneKey = typeof body.scene_key === 'string' ? body.scene_key.trim().toUpperCase().slice(0, 32) : '';
        const alias = typeof body.alias === 'string' ? body.alias.trim().slice(0, 24) : '';
        if (!id || !sceneKey || !alias) {
          return jsonResponse(request, env, { error: 'Invalid user profile fields' }, 400);
        }

        const now = new Date().toISOString();
        const avatarJson = JSON.stringify(body.avatar || { bg: 'from-violet-600 to-indigo-900', emoji: '⚡' });
        const tagsJson = JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 6) : []);
        const slidersJson = JSON.stringify(body.sliders || { talk: 50, owl: 50, hustle: 50 });
        const prompt =
          typeof body.scene_prompt === 'string'
            ? body.scene_prompt.trim().slice(0, 160)
            : 'Aaj ka scene kya hai?';
        const aura = typeof body.scene_aura === 'number' ? Math.max(-5, body.scene_aura) : 5;
        const isOnline = body.is_online === false ? 0 : 1;

        await env.DB.prepare(
          `INSERT INTO scene_users (
            id, scene_key, alias, avatar_json, tags_json, sliders_json, scene_prompt, scene_aura, is_online, last_seen, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            alias = excluded.alias,
            avatar_json = excluded.avatar_json,
            tags_json = excluded.tags_json,
            sliders_json = excluded.sliders_json,
            scene_prompt = excluded.scene_prompt,
            is_online = excluded.is_online,
            last_seen = excluded.last_seen`
        )
          .bind(id, sceneKey, alias, avatarJson, tagsJson, slidersJson, prompt, aura, isOnline, now, now)
          .run();

        const saved = await env.DB.prepare('SELECT * FROM scene_users WHERE id = ?').bind(id).first<UserRow>();
        const userObj = saved ? mapUserRow(saved) : null;

        ctx.waitUntil(
          env.LOBBY_HUB.getByName('global-lobby').broadcastLobbyEvent({
            type: 'users_updated',
            userId: id,
          })
        );

        return jsonResponse(request, env, { user: userObj });
      }

      if (path.startsWith('/api/users/key/') && request.method === 'GET') {
        const key = decodeURIComponent(path.replace('/api/users/key/', '')).trim().toUpperCase();
        const row = await env.DB.prepare('SELECT * FROM scene_users WHERE scene_key = ?')
          .bind(key)
          .first<UserRow>();
        return jsonResponse(request, env, { user: row ? mapUserRow(row) : null });
      }

      if (path.startsWith('/api/users/') && request.method === 'GET') {
        const userId = decodeURIComponent(path.replace('/api/users/', '')).trim();
        const row = await env.DB.prepare(
          'SELECT * FROM scene_users WHERE id = ? OR id LIKE ? LIMIT 1'
        )
          .bind(userId, `${userId}%`)
          .first<UserRow>();
        return jsonResponse(request, env, { user: row ? mapUserRow(row) : null });
      }

      // 5. Aura Voting Endpoint (Server-enforced single vote per pair + safe delta bounds)
      if (path === '/api/aura' && request.method === 'POST') {
        const body = (await request.json()) as {
          targetUserId?: string;
          voterUserId?: string;
          delta?: number;
        };
        const targetId = body.targetUserId?.trim() || '';
        const voterId = body.voterUserId?.trim() || '';
        if (!targetId || !voterId || targetId === voterId) {
          return jsonResponse(request, env, {
            success: false,
            message: 'You cannot vote on your own aura!',
          });
        }

        const safeDelta = Number(body.delta) > 0 ? 1 : -2;
        const pairKey = `${voterId}->${targetId}`;

        const existingVote = await env.DB.prepare('SELECT pair_key FROM aura_votes WHERE pair_key = ?')
          .bind(pairKey)
          .first();
        if (existingVote) {
          return jsonResponse(request, env, {
            success: false,
            message: 'You have already voted on this user’s aura!',
          });
        }

        await env.DB.prepare(
          'INSERT INTO aura_votes (pair_key, target_user_id, voter_user_id, delta, created_at) VALUES (?, ?, ?, ?, ?)'
        )
          .bind(pairKey, targetId, voterId, safeDelta, new Date().toISOString())
          .run();

        let newAura = Math.max(-5, 8 + safeDelta);
        if (!targetId.startsWith('ai-')) {
          const targetRow = await env.DB.prepare('SELECT scene_aura FROM scene_users WHERE id = ?')
            .bind(targetId)
            .first<{ scene_aura: number }>();
          if (targetRow) {
            newAura = Math.max(-5, targetRow.scene_aura + safeDelta);
            await env.DB.prepare('UPDATE scene_users SET scene_aura = ? WHERE id = ?')
              .bind(newAura, targetId)
              .run();
          }
        }

        ctx.waitUntil(
          env.LOBBY_HUB.getByName('global-lobby').broadcastLobbyEvent({
            type: 'aura_voted',
            targetUserId: targetId,
            newAura,
          })
        );

        return jsonResponse(request, env, { success: true, newAura });
      }

      // 6. Voice Rooms Endpoints
      if (path === '/api/rooms' && request.method === 'GET') {
        await ensureStarterRooms(env.DB);
        const requesterId = url.searchParams.get('userId');
        const rows = await env.DB.prepare('SELECT * FROM scene_rooms ORDER BY created_at DESC LIMIT 50').all<RoomRow>();
        return jsonResponse(request, env, {
          rooms: (rows.results || []).map((r) => mapRoomRow(r, requesterId)),
        });
      }

      if (path === '/api/rooms' && request.method === 'POST') {
        const body = (await request.json()) as Record<string, unknown>;
        const id = typeof body.id === 'string' ? body.id.trim().slice(0, 64) : '';
        const title = typeof body.title === 'string' ? body.title.trim().slice(0, 60) : '';
        if (!id || !title) {
          return jsonResponse(request, env, { error: 'Invalid room payload' }, 400);
        }

        const existing = await env.DB.prepare('SELECT room_pin, host_id FROM scene_rooms WHERE id = ?')
          .bind(id)
          .first<{ room_pin: string | null; host_id: string | null }>();

        const vibeTag = typeof body.vibe_tag === 'string' ? body.vibe_tag.slice(0, 40) : '☕ Chai & Bakchodi';
        const participantsJson = JSON.stringify(Array.isArray(body.participants) ? body.participants.slice(0, 16) : []);
        const maxUsers = typeof body.max_users === 'number' ? body.max_users : 6;
        const activeTopic =
          typeof body.active_topic === 'string' ? body.active_topic.trim().slice(0, 140) : 'Aaj ka scene kya hai?';
        const kickVotesJson = JSON.stringify(body.kick_votes || {});
        const isPrivate = body.is_private ? 1 : 0;
        const roomPin =
          typeof body.room_pin === 'string' && body.room_pin.trim()
            ? body.room_pin.trim().slice(0, 8)
            : existing?.room_pin || null;
        const hostId = typeof body.host_id === 'string' ? body.host_id.slice(0, 64) : existing?.host_id || null;
        const lockedSeatsJson = JSON.stringify(Array.isArray(body.locked_seats) ? body.locked_seats : []);
        const createdAt = typeof body.created_at === 'string' ? body.created_at : new Date().toISOString();

        await env.DB.prepare(
          `INSERT INTO scene_rooms (
            id, title, vibe_tag, participants_json, max_users, active_topic,
            kick_votes_json, is_private, room_pin, host_id, locked_seats_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            participants_json = excluded.participants_json,
            active_topic = excluded.active_topic,
            kick_votes_json = excluded.kick_votes_json,
            locked_seats_json = excluded.locked_seats_json`
        )
          .bind(
            id,
            title,
            vibeTag,
            participantsJson,
            maxUsers,
            activeTopic,
            kickVotesJson,
            isPrivate,
            roomPin,
            hostId,
            lockedSeatsJson,
            createdAt
          )
          .run();

        const saved = await env.DB.prepare('SELECT * FROM scene_rooms WHERE id = ?').bind(id).first<RoomRow>();
        ctx.waitUntil(
          env.LOBBY_HUB.getByName('global-lobby').broadcastLobbyEvent({
            type: 'rooms_updated',
            roomId: id,
          })
        );
        return jsonResponse(request, env, { room: saved ? mapRoomRow(saved, hostId) : null });
      }

      if (path.match(/^\/api\/rooms\/[^/]+\/verify-pin$/) && request.method === 'POST') {
        const roomId = decodeURIComponent(path.split('/')[3]);
        const body = (await request.json()) as { pin?: string };
        const room = await env.DB.prepare('SELECT is_private, room_pin FROM scene_rooms WHERE id = ?')
          .bind(roomId)
          .first<{ is_private: number; room_pin: string | null }>();
        if (!room) return jsonResponse(request, env, { valid: false }, 404);
        if (!room.is_private) return jsonResponse(request, env, { valid: true });
        const valid = Boolean(room.room_pin && body.pin?.trim() === room.room_pin.trim());
        return jsonResponse(request, env, { valid });
      }

      // 7. Chats & Messages Endpoints
      if (path === '/api/chats' && request.method === 'POST') {
        const body = (await request.json()) as { user1Id?: string; user2Id?: string };
        const [firstId, secondId] = [body.user1Id?.trim() || '', body.user2Id?.trim() || ''].sort();
        if (!firstId || !secondId) {
          return jsonResponse(request, env, { error: 'Both user IDs required' }, 400);
        }

        const existing = await env.DB.prepare(
          'SELECT * FROM scene_chats WHERE user_1 = ? AND user_2 = ?'
        )
          .bind(firstId, secondId)
          .first<ChatRow>();
        if (existing) return jsonResponse(request, env, { chat: mapChatRow(existing) });

        const chatId = `chat_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const now = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO scene_chats (id, user_1, user_2, msg_count_1, msg_count_2, socials_shared_json, created_at)
           VALUES (?, ?, ?, 0, 0, '{}', ?)`
        )
          .bind(chatId, firstId, secondId, now)
          .run();

        const created = await env.DB.prepare('SELECT * FROM scene_chats WHERE id = ?').bind(chatId).first<ChatRow>();
        return jsonResponse(request, env, { chat: created ? mapChatRow(created) : null });
      }

      if (path.match(/^\/api\/chats\/[^/]+\/messages$/) && request.method === 'GET') {
        const chatId = decodeURIComponent(path.split('/')[3]);
        const rows = await env.DB.prepare(
          'SELECT * FROM scene_messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 200'
        )
          .bind(chatId)
          .all<MessageRow>();
        return jsonResponse(request, env, { messages: rows.results || [] });
      }

      if (path.match(/^\/api\/chats\/[^/]+\/messages$/) && request.method === 'POST') {
        const chatId = decodeURIComponent(path.split('/')[3]);
        const body = (await request.json()) as {
          senderId?: string;
          body?: string;
          msgType?: 'text' | 'game_card' | 'system';
        };
        const senderId = body.senderId?.trim() || '';
        const cleanBody = body.body?.trim().slice(0, 1000) || '';
        if (!senderId || !cleanBody) {
          return jsonResponse(request, env, { error: 'Sender and body required' }, 400);
        }

        const msgType = body.msgType === 'game_card' || body.msgType === 'system' ? body.msgType : 'text';
        const msgId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const now = new Date().toISOString();

        await env.DB.prepare(
          'INSERT INTO scene_messages (id, chat_id, sender_id, body, msg_type, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
          .bind(msgId, chatId, senderId, cleanBody, msgType, now)
          .run();

        const chat = await env.DB.prepare('SELECT * FROM scene_chats WHERE id = ?')
          .bind(chatId)
          .first<ChatRow>();
        if (chat) {
          const col = chat.user_1 === senderId ? 'msg_count_1' : 'msg_count_2';
          const nextCount = (chat.user_1 === senderId ? chat.msg_count_1 : chat.msg_count_2) + 1;
          await env.DB.prepare(`UPDATE scene_chats SET ${col} = ? WHERE id = ?`).bind(nextCount, chatId).run();
        }

        const messageObj = { id: msgId, chat_id: chatId, sender_id: senderId, body: cleanBody, msg_type: msgType, created_at: now };

        ctx.waitUntil(
          env.ROOM_RELAY.getByName(`room_chat_${chatId}`).relayEvent(
            { type: 'dm_message', chatId, message: messageObj },
            senderId
          )
        );

        return jsonResponse(request, env, { message: messageObj });
      }

      if (path.match(/^\/api\/chats\/[^/]+\/socials$/) && request.method === 'POST') {
        const chatId = decodeURIComponent(path.split('/')[3]);
        const body = (await request.json()) as { userId?: string; socials?: Record<string, string> };
        const userId = body.userId?.trim() || '';
        if (!userId || !body.socials) {
          return jsonResponse(request, env, { error: 'User ID and socials required' }, 400);
        }

        const chat = await env.DB.prepare('SELECT socials_shared_json FROM scene_chats WHERE id = ?')
          .bind(chatId)
          .first<{ socials_shared_json: string }>();
        if (!chat) return jsonResponse(request, env, { error: 'Chat not found' }, 404);

        const existingSocials = JSON.parse(chat.socials_shared_json || '{}') as Record<string, unknown>;
        const cleanHandle = (v?: unknown) =>
          typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, 60) || undefined : undefined;
        const safeSocials = {
          instagram: cleanHandle(body.socials.instagram),
          discord: cleanHandle(body.socials.discord),
          github: cleanHandle(body.socials.github),
        };
        existingSocials[userId] = safeSocials;

        await env.DB.prepare('UPDATE scene_chats SET socials_shared_json = ? WHERE id = ?')
          .bind(JSON.stringify(existingSocials), chatId)
          .run();

        ctx.waitUntil(
          env.ROOM_RELAY.getByName(`room_chat_${chatId}`).relayEvent(
            { type: 'dm_socials', chatId, userId, socials: safeSocials },
            userId
          )
        );

        return jsonResponse(request, env, { socials: safeSocials });
      }

      return jsonResponse(request, env, { error: 'Not Found' }, 404);
    } catch (err) {
      console.error(
        JSON.stringify({
          message: 'Worker error',
          path,
          error: err instanceof Error ? err.message : String(err),
        })
      );
      return jsonResponse(request, env, { error: 'Internal Server Error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
