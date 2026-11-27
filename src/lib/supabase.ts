import { createClient } from '@supabase/supabase-js';
import { SceneChat, SceneMessage, SceneRoom, SceneUser, UserSocials } from '../types';
import { INITIAL_ROOMS } from './mockData';
import { AI_PERSONAS_ENABLED, getAIPersonaUsers } from './groqEngine';
import { buildApiUrl } from './backendConfig';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('https://') &&
    !supabaseUrl.includes('placeholder')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null;

// Local fallback & offline cache keys
const STORAGE_USERS_KEY = 'sceneon_all_users';
const STORAGE_ROOMS_KEY = 'sceneon_all_rooms';
const STORAGE_CHATS_KEY = 'sceneon_all_chats';
const STORAGE_MSGS_KEY = 'sceneon_all_messages';
const STORAGE_AURA_VOTES = 'sceneon_aura_voted_pairs';
const STORAGE_AI_AURA_KEY = 'sceneon_ai_aura_map';

// Cross-tab synchronization bus
let tabSyncBus: BroadcastChannel | null = null;
if (typeof window !== 'undefined') {
  try {
    tabSyncBus = new BroadcastChannel('friendsclub_sync_bus');
    tabSyncBus.onmessage = (event) => {
      if (event.data?.type) {
        window.dispatchEvent(new CustomEvent('sceneon-sync', { detail: event.data }));
      }
    };
  } catch {
    // BroadcastChannel unavailable in restricted environments
  }
}

function notifyLocalChange(type: string, detail?: Record<string, unknown>) {
  const payload = { type, ...detail };
  window.dispatchEvent(new CustomEvent('sceneon-sync', { detail: payload }));
  try {
    tabSyncBus?.postMessage(payload);
  } catch {
    // Ignore channel post errors
  }
}

function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function setStored<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Local storage write error:', err);
  }
}

function sanitizeHandle(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[<>]/g, '').trim().slice(0, 60);
  return cleaned || undefined;
}

async function d1FetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch(buildApiUrl(path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Initialize seed data in localStorage if empty and purge legacy dummy characters
export function initLocalStore() {
  const existingUsers = getStored<SceneUser[]>(STORAGE_USERS_KEY, []);
  const cleanUsers = existingUsers.filter((u) => !u.id.startsWith('peer-'));
  setStored(STORAGE_USERS_KEY, cleanUsers);

  const existingRooms = getStored<SceneRoom[]>(STORAGE_ROOMS_KEY, []);
  if (!existingRooms.length) {
    setStored(STORAGE_ROOMS_KEY, INITIAL_ROOMS);
  } else {
    const cleanRooms = existingRooms.map((r) => ({
      ...r,
      participants: (r.participants || []).filter((p) => !p.id.startsWith('user-p')),
    }));
    setStored(STORAGE_ROOMS_KEY, cleanRooms);
  }

  if (!localStorage.getItem(STORAGE_CHATS_KEY)) {
    setStored(STORAGE_CHATS_KEY, []);
  }
  if (!localStorage.getItem(STORAGE_MSGS_KEY)) {
    setStored(STORAGE_MSGS_KEY, []);
  }
}

function mergeAIPersonas(users: SceneUser[]): SceneUser[] {
  if (!AI_PERSONAS_ENABLED) return users;
  const aiAuraMap = getStored<Record<string, number>>(STORAGE_AI_AURA_KEY, {});
  const aiUsers = getAIPersonaUsers().map((a) => ({
    ...a,
    scene_aura: aiAuraMap[a.id] ?? a.scene_aura,
  }));
  const existingIds = new Set(users.map((u) => u.id));
  const toAdd = aiUsers.filter((a) => !existingIds.has(a.id));
  return [...toAdd, ...users];
}

// ----------------- USER HELPERS -----------------
export async function fetchSceneUsers(): Promise<SceneUser[]> {
  const remote = await d1FetchJson<{ users?: SceneUser[] }>('/api/users');
  if (remote?.users) {
    return mergeAIPersonas(remote.users);
  }

  let users: SceneUser[] = [];
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('scene_users')
      .select('*')
      .order('last_seen', { ascending: false });
    if (!error && data) {
      users = data as SceneUser[];
    }
  } else {
    initLocalStore();
    users = getStored<SceneUser[]>(STORAGE_USERS_KEY, []);
  }

  return mergeAIPersonas(users);
}

export async function upsertSceneUser(user: SceneUser): Promise<SceneUser> {
  const safeUser: SceneUser = {
    ...user,
    alias: user.alias.trim().slice(0, 24) || 'GenZFriend',
    scene_prompt: user.scene_prompt.trim().slice(0, 160) || 'Aaj ka scene kya hai?',
    tags: (user.tags || []).slice(0, 6).map((t) => t.slice(0, 36)),
    last_seen: new Date().toISOString(),
  };

  const remote = await d1FetchJson<{ user?: SceneUser }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(safeUser),
  });

  if (!remote?.user && isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('scene_users')
      .upsert({
        id: safeUser.id,
        scene_key: safeUser.scene_key,
        alias: safeUser.alias,
        avatar: safeUser.avatar,
        tags: safeUser.tags,
        sliders: safeUser.sliders,
        scene_prompt: safeUser.scene_prompt,
        scene_aura: safeUser.scene_aura,
        is_online: safeUser.is_online,
        last_seen: safeUser.last_seen,
      })
      .select()
      .single();

    if (!error && data) {
      return data as SceneUser;
    }
  }

  const savedUser = remote?.user || safeUser;
  initLocalStore();
  const allUsers = getStored<SceneUser[]>(STORAGE_USERS_KEY, []);
  const existingIdx = allUsers.findIndex(
    (u) => u.id === savedUser.id || u.scene_key === savedUser.scene_key
  );

  if (existingIdx >= 0) {
    allUsers[existingIdx] = savedUser;
  } else {
    allUsers.unshift(savedUser);
  }
  setStored(STORAGE_USERS_KEY, allUsers);
  notifyLocalChange('users_updated', { user: savedUser });
  return savedUser;
}

export async function getSceneUserByKey(key: string): Promise<SceneUser | null> {
  const cleanKey = key.trim().toUpperCase();
  if (!cleanKey) return null;

  if (AI_PERSONAS_ENABLED) {
    const aiUser = getAIPersonaUsers().find((u) => u.scene_key.toUpperCase() === cleanKey);
    if (aiUser) return aiUser;
  }

  const remote = await d1FetchJson<{ user?: SceneUser | null }>(
    `/api/users/key/${encodeURIComponent(cleanKey)}`
  );
  if (remote?.user) return remote.user;

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('scene_users')
      .select('*')
      .eq('scene_key', cleanKey)
      .maybeSingle();

    if (!error && data) return data as SceneUser;
  }

  initLocalStore();
  const allUsers = getStored<SceneUser[]>(STORAGE_USERS_KEY, []);
  return allUsers.find((u) => u.scene_key.toUpperCase() === cleanKey) || null;
}

export async function getSceneUserById(id: string): Promise<SceneUser | null> {
  if (id.startsWith('ai-') && AI_PERSONAS_ENABLED) {
    const aiAuraMap = getStored<Record<string, number>>(STORAGE_AI_AURA_KEY, {});
    const aiUser = getAIPersonaUsers().find((u) => u.id === id);
    if (aiUser) {
      return { ...aiUser, scene_aura: aiAuraMap[aiUser.id] ?? aiUser.scene_aura };
    }
  }

  const remote = await d1FetchJson<{ user?: SceneUser | null }>(
    `/api/users/${encodeURIComponent(id)}`
  );
  if (remote?.user) return remote.user;

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('scene_users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!error && data) return data as SceneUser;
  }

  initLocalStore();
  const allUsers = getStored<SceneUser[]>(STORAGE_USERS_KEY, []);
  return allUsers.find((u) => u.id === id) || null;
}

// ----------------- ROOMS HELPERS -----------------
export async function fetchSceneRooms(currentUserId?: string): Promise<SceneRoom[]> {
  const query = currentUserId ? `?userId=${encodeURIComponent(currentUserId)}` : '';
  const remote = await d1FetchJson<{ rooms?: SceneRoom[] }>(`/api/rooms${query}`);
  if (remote?.rooms) return remote.rooms;

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('scene_rooms')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) return data as SceneRoom[];
  }

  initLocalStore();
  return getStored<SceneRoom[]>(STORAGE_ROOMS_KEY, INITIAL_ROOMS);
}

export async function upsertSceneRoom(room: SceneRoom): Promise<SceneRoom> {
  const safeRoom: SceneRoom = {
    ...room,
    title: room.title.trim().slice(0, 60),
    active_topic: room.active_topic.trim().slice(0, 140),
  };

  const remote = await d1FetchJson<{ room?: SceneRoom }>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify(safeRoom),
  });
  const savedRoom = remote?.room || safeRoom;

  if (!remote?.room && isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('scene_rooms')
      .upsert(safeRoom)
      .select()
      .single();

    if (!error && data) return data as SceneRoom;
  }

  initLocalStore();
  const allRooms = getStored<SceneRoom[]>(STORAGE_ROOMS_KEY, INITIAL_ROOMS);
  const idx = allRooms.findIndex((r) => r.id === savedRoom.id);
  if (idx >= 0) {
    allRooms[idx] = savedRoom;
  } else {
    allRooms.unshift(savedRoom);
  }
  setStored(STORAGE_ROOMS_KEY, allRooms);
  notifyLocalChange('room_updated', { room: savedRoom });
  return savedRoom;
}

export async function verifyRoomPin(room: SceneRoom, pin: string): Promise<boolean> {
  const cleanPin = pin.trim();
  if (!room.is_private) return true;

  const remote = await d1FetchJson<{ valid?: boolean }>(
    `/api/rooms/${encodeURIComponent(room.id)}/verify-pin`,
    {
      method: 'POST',
      body: JSON.stringify({ pin: cleanPin }),
    }
  );
  if (remote && typeof remote.valid === 'boolean') {
    return remote.valid;
  }

  if (room.room_pin) {
    return cleanPin === room.room_pin.trim();
  }
  return false;
}

// ----------------- CHATS & MESSAGES HELPERS -----------------
export async function getOrCreateChat(user1Id: string, user2Id: string): Promise<SceneChat> {
  const [firstId, secondId] = [user1Id, user2Id].sort();

  const remote = await d1FetchJson<{ chat?: SceneChat }>('/api/chats', {
    method: 'POST',
    body: JSON.stringify({ user1Id: firstId, user2Id: secondId }),
  });
  if (remote?.chat) return remote.chat;

  if (isSupabaseConfigured && supabase) {
    const { data: existing } = await supabase
      .from('scene_chats')
      .select('*')
      .eq('user_1', firstId)
      .eq('user_2', secondId)
      .maybeSingle();

    if (existing) return existing as SceneChat;

    const { data: created, error } = await supabase
      .from('scene_chats')
      .insert({
        user_1: firstId,
        user_2: secondId,
        msg_count_1: 0,
        msg_count_2: 0,
        socials_shared: {},
      })
      .select()
      .single();

    if (!error && created) return created as SceneChat;
  }

  initLocalStore();
  const allChats = getStored<SceneChat[]>(STORAGE_CHATS_KEY, []);
  const found = allChats.find((c) => c.user_1 === firstId && c.user_2 === secondId);
  if (found) return found;

  const newChat: SceneChat = {
    id: `chat-${firstId.slice(0, 4)}-${secondId.slice(0, 4)}-${Date.now()}`,
    user_1: firstId,
    user_2: secondId,
    msg_count_1: 0,
    msg_count_2: 0,
    socials_shared: {},
    created_at: new Date().toISOString(),
  };

  allChats.push(newChat);
  setStored(STORAGE_CHATS_KEY, allChats);
  notifyLocalChange('chat_created', { chat: newChat });
  return newChat;
}

export async function fetchSceneMessages(chatId: string): Promise<SceneMessage[]> {
  const remote = await d1FetchJson<{ messages?: SceneMessage[] }>(
    `/api/chats/${encodeURIComponent(chatId)}/messages`
  );
  if (remote?.messages) return remote.messages;

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('scene_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (!error && data) return data as SceneMessage[];
  }

  initLocalStore();
  const allMsgs = getStored<SceneMessage[]>(STORAGE_MSGS_KEY, []);
  return allMsgs.filter((m) => m.chat_id === chatId);
}

export async function sendSceneMessage(
  chatId: string,
  senderId: string,
  body: string,
  msgType: 'text' | 'game_card' | 'system' = 'text'
): Promise<SceneMessage> {
  const cleanBody = body.trim().slice(0, 1000);

  const remote = await d1FetchJson<{ message?: SceneMessage }>(
    `/api/chats/${encodeURIComponent(chatId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ senderId, body: cleanBody, msgType }),
    }
  );

  const savedMsg: SceneMessage = remote?.message || {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    chat_id: chatId,
    sender_id: senderId,
    body: cleanBody,
    msg_type: msgType,
    created_at: new Date().toISOString(),
  };

  if (!remote?.message && isSupabaseConfigured && supabase) {
    await supabase.from('scene_messages').insert({
      chat_id: chatId,
      sender_id: senderId,
      body: cleanBody,
      msg_type: msgType,
    });

    const { data: chat } = await supabase.from('scene_chats').select('*').eq('id', chatId).single();
    if (chat) {
      if (chat.user_1 === senderId) {
        await supabase.from('scene_chats').update({ msg_count_1: chat.msg_count_1 + 1 }).eq('id', chatId);
      } else {
        await supabase.from('scene_chats').update({ msg_count_2: chat.msg_count_2 + 1 }).eq('id', chatId);
      }
    }
  }

  initLocalStore();
  const allMsgs = getStored<SceneMessage[]>(STORAGE_MSGS_KEY, []);
  if (!allMsgs.some((m) => m.id === savedMsg.id)) {
    allMsgs.push(savedMsg);
    setStored(STORAGE_MSGS_KEY, allMsgs);
  }

  const allChats = getStored<SceneChat[]>(STORAGE_CHATS_KEY, []);
  const chatIdx = allChats.findIndex((c) => c.id === chatId);
  if (chatIdx >= 0) {
    if (allChats[chatIdx].user_1 === senderId) {
      allChats[chatIdx].msg_count_1 += 1;
    } else {
      allChats[chatIdx].msg_count_2 += 1;
    }
    setStored(STORAGE_CHATS_KEY, allChats);
  }

  notifyLocalChange('new_message', { message: savedMsg, chatId });
  return savedMsg;
}

export async function updateChatSocials(
  chatId: string,
  userId: string,
  socials: UserSocials
): Promise<UserSocials> {
  const safeSocials: UserSocials = {
    instagram: sanitizeHandle(socials.instagram),
    discord: sanitizeHandle(socials.discord),
    github: sanitizeHandle(socials.github),
  };

  const remote = await d1FetchJson<{ socials?: UserSocials }>(
    `/api/chats/${encodeURIComponent(chatId)}/socials`,
    {
      method: 'POST',
      body: JSON.stringify({ userId, socials: safeSocials }),
    }
  );
  const resolvedSocials = remote?.socials || safeSocials;

  if (!remote?.socials && isSupabaseConfigured && supabase) {
    const { data: chat } = await supabase.from('scene_chats').select('*').eq('id', chatId).single();
    if (chat) {
      const updatedSocials = { ...chat.socials_shared, [userId]: safeSocials };
      await supabase.from('scene_chats').update({ socials_shared: updatedSocials }).eq('id', chatId);
    }
  }

  initLocalStore();
  const allChats = getStored<SceneChat[]>(STORAGE_CHATS_KEY, []);
  const chatIdx = allChats.findIndex((c) => c.id === chatId);
  if (chatIdx >= 0) {
    allChats[chatIdx].socials_shared = {
      ...(allChats[chatIdx].socials_shared || {}),
      [userId]: resolvedSocials,
    };
    setStored(STORAGE_CHATS_KEY, allChats);
    notifyLocalChange('socials_updated', { chatId, userId, socials: resolvedSocials });
  }
  return resolvedSocials;
}

// ----------------- AURA VOTING -----------------
export async function voteAura(
  targetUserId: string,
  voterUserId: string,
  delta: number
): Promise<{ success: boolean; newAura?: number; message?: string }> {
  if (!targetUserId || !voterUserId || targetUserId === voterUserId) {
    return { success: false, message: 'You cannot vote on your own aura!' };
  }

  const safeDelta = delta > 0 ? 1 : -2;
  const votedPairs = getStored<string[]>(STORAGE_AURA_VOTES, []);
  const pairKey = `${voterUserId}->${targetUserId}`;

  if (votedPairs.includes(pairKey)) {
    return { success: false, message: 'You have already voted on this user’s aura!' };
  }

  const remote = await d1FetchJson<{ success?: boolean; newAura?: number; message?: string }>(
    '/api/aura',
    {
      method: 'POST',
      body: JSON.stringify({ targetUserId, voterUserId, delta: safeDelta }),
    }
  );

  if (remote && typeof remote.success === 'boolean') {
    if (!remote.success) {
      return { success: false, message: remote.message || 'Already voted.' };
    }
    if (targetUserId.startsWith('ai-') && typeof remote.newAura === 'number') {
      const aiAuraMap = getStored<Record<string, number>>(STORAGE_AI_AURA_KEY, {});
      aiAuraMap[targetUserId] = remote.newAura;
      setStored(STORAGE_AI_AURA_KEY, aiAuraMap);
    }
    votedPairs.push(pairKey);
    setStored(STORAGE_AURA_VOTES, votedPairs);
    notifyLocalChange('aura_voted', { targetUserId, newAura: remote.newAura });
    return { success: true, newAura: remote.newAura };
  }

  let updatedAura: number | undefined;

  if (targetUserId.startsWith('ai-')) {
    const aiPersona = getAIPersonaUsers().find((u) => u.id === targetUserId);
    const aiAuraMap = getStored<Record<string, number>>(STORAGE_AI_AURA_KEY, {});
    const baseAura = aiAuraMap[targetUserId] ?? aiPersona?.scene_aura ?? 8;
    updatedAura = Math.max(-5, baseAura + safeDelta);
    aiAuraMap[targetUserId] = updatedAura;
    setStored(STORAGE_AI_AURA_KEY, aiAuraMap);
  } else if (isSupabaseConfigured && supabase) {
    const { data: targetUser } = await supabase
      .from('scene_users')
      .select('scene_aura')
      .eq('id', targetUserId)
      .maybeSingle();

    if (!targetUser) {
      return { success: false, message: 'User profile not found.' };
    }
    updatedAura = Math.max(-5, (targetUser.scene_aura ?? 5) + safeDelta);
    await supabase.from('scene_users').update({ scene_aura: updatedAura }).eq('id', targetUserId);
  } else {
    const allUsers = getStored<SceneUser[]>(STORAGE_USERS_KEY, []);
    const targetIdx = allUsers.findIndex((u) => u.id === targetUserId);
    if (targetIdx >= 0) {
      allUsers[targetIdx].scene_aura = Math.max(-5, (allUsers[targetIdx].scene_aura ?? 5) + safeDelta);
      updatedAura = allUsers[targetIdx].scene_aura;
      setStored(STORAGE_USERS_KEY, allUsers);
    } else {
      updatedAura = Math.max(-5, 5 + safeDelta);
    }
  }

  votedPairs.push(pairKey);
  setStored(STORAGE_AURA_VOTES, votedPairs);
  notifyLocalChange('aura_voted', { targetUserId, newAura: updatedAura });

  return { success: true, newAura: updatedAura };
}
