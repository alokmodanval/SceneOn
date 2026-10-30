import { createClient } from '@supabase/supabase-js';
import { SceneChat, SceneMessage, SceneRoom, SceneUser, UserSocials } from '../types';
import { INITIAL_PEERS, INITIAL_ROOMS } from './mockData';
import { getAIPersonaUsers, GROQ_API_KEY } from './groqEngine';

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

// Local fallback store keys
const STORAGE_USERS_KEY = 'sceneon_all_users';
const STORAGE_ROOMS_KEY = 'sceneon_all_rooms';
const STORAGE_CHATS_KEY = 'sceneon_all_chats';
const STORAGE_MSGS_KEY = 'sceneon_all_messages';
const STORAGE_AURA_VOTES = 'sceneon_aura_voted_pairs';

function notifyLocalChange(type: string, detail?: any) {
  window.dispatchEvent(new CustomEvent('sceneon-sync', { detail: { type, ...detail } }));
}

function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
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

// Initialize seed data in localStorage if empty and purge legacy dummy characters
export function initLocalStore() {
  const existingUsers = getStored<SceneUser[]>(STORAGE_USERS_KEY, []);
  // Purge any legacy dummy mock peers
  const cleanUsers = existingUsers.filter(u => !u.id.startsWith('peer-'));
  setStored(STORAGE_USERS_KEY, cleanUsers);

  const existingRooms = getStored<SceneRoom[]>(STORAGE_ROOMS_KEY, []);
  if (!existingRooms.length) {
    setStored(STORAGE_ROOMS_KEY, INITIAL_ROOMS);
  } else {
    // Purge fake mock participants from rooms
    const cleanRooms = existingRooms.map(r => ({
      ...r,
      participants: (r.participants || []).filter(p => !p.id.startsWith('user-p'))
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

// ----------------- USER HELPERS -----------------
export async function fetchSceneUsers(): Promise<SceneUser[]> {
  let users: SceneUser[] = [];
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('scene_users')
      .select('*')
      .order('last_seen', { ascending: false });
    if (!error && data) {
      users = data;
    }
  } else {
    initLocalStore();
    users = getStored<SceneUser[]>(STORAGE_USERS_KEY, []);
  }

  // If Groq AI personas are active, merge them on the board
  if (GROQ_API_KEY) {
    const aiUsers = getAIPersonaUsers();
    const existingAiIds = new Set(users.map(u => u.id));
    const toAdd = aiUsers.filter(a => !existingAiIds.has(a.id));
    return [...toAdd, ...users];
  }

  return users;
}

export async function upsertSceneUser(user: SceneUser): Promise<SceneUser> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('scene_users')
      .upsert({
        id: user.id,
        scene_key: user.scene_key,
        alias: user.alias,
        avatar: user.avatar,
        tags: user.tags,
        sliders: user.sliders,
        scene_prompt: user.scene_prompt,
        scene_aura: user.scene_aura,
        is_online: user.is_online,
        last_seen: new Date().toISOString(),
      })
      .select()
      .single();

    if (!error && data) {
      return data as SceneUser;
    }
  }

  // Fallback
  initLocalStore();
  const allUsers = getStored<SceneUser[]>(STORAGE_USERS_KEY, INITIAL_PEERS);
  const existingIdx = allUsers.findIndex(u => u.id === user.id || u.scene_key === user.scene_key);
  const updatedUser = { ...user, last_seen: new Date().toISOString() };

  if (existingIdx >= 0) {
    allUsers[existingIdx] = updatedUser;
  } else {
    allUsers.unshift(updatedUser);
  }
  setStored(STORAGE_USERS_KEY, allUsers);
  notifyLocalChange('users_updated', { user: updatedUser });
  return updatedUser;
}

export async function getSceneUserByKey(key: string): Promise<SceneUser | null> {
  const cleanKey = key.trim().toUpperCase();
  if (GROQ_API_KEY) {
    const aiUser = getAIPersonaUsers().find(u => u.scene_key.toUpperCase() === cleanKey);
    if (aiUser) return aiUser;
  }

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
  const found = allUsers.find(u => u.scene_key.toUpperCase() === cleanKey);
  return found || null;
}

export async function getSceneUserById(id: string): Promise<SceneUser | null> {
  if (id.startsWith('ai-') && GROQ_API_KEY) {
    const aiUser = getAIPersonaUsers().find(u => u.id === id);
    if (aiUser) return aiUser;
  }

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
  return allUsers.find(u => u.id === id) || null;
}

// ----------------- ROOMS HELPERS -----------------
export async function fetchSceneRooms(): Promise<SceneRoom[]> {
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
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('scene_rooms')
      .upsert(room)
      .select()
      .single();

    if (!error && data) return data as SceneRoom;
  }

  initLocalStore();
  const allRooms = getStored<SceneRoom[]>(STORAGE_ROOMS_KEY, INITIAL_ROOMS);
  const idx = allRooms.findIndex(r => r.id === room.id);
  if (idx >= 0) {
    allRooms[idx] = room;
  } else {
    allRooms.unshift(room);
  }
  setStored(STORAGE_ROOMS_KEY, allRooms);
  notifyLocalChange('room_updated', { room });
  return room;
}

// ----------------- CHATS & MESSAGES HELPERS -----------------
export async function getOrCreateChat(user1Id: string, user2Id: string): Promise<SceneChat> {
  // Sort user IDs to have consistent lookup
  const [firstId, secondId] = [user1Id, user2Id].sort();

  if (isSupabaseConfigured && supabase) {
    // Try to find existing
    const { data: existing } = await supabase
      .from('scene_chats')
      .select('*')
      .eq('user_1', firstId)
      .eq('user_2', secondId)
      .maybeSingle();

    if (existing) return existing as SceneChat;

    // Create new
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

  // Local fallback
  initLocalStore();
  const allChats = getStored<SceneChat[]>(STORAGE_CHATS_KEY, []);
  const found = allChats.find(c => (c.user_1 === firstId && c.user_2 === secondId));
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
  return allMsgs.filter(m => m.chat_id === chatId);
}

export async function sendSceneMessage(
  chatId: string, 
  senderId: string, 
  body: string, 
  msgType: 'text' | 'game_card' | 'system' = 'text'
): Promise<SceneMessage> {
  const newMsg: SceneMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    chat_id: chatId,
    sender_id: senderId,
    body,
    msg_type: msgType,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured && supabase) {
    await supabase.from('scene_messages').insert({
      chat_id: chatId,
      sender_id: senderId,
      body,
      msg_type: msgType,
    });

    // Increment message count in chat
    const { data: chat } = await supabase.from('scene_chats').select('*').eq('id', chatId).single();
    if (chat) {
      if (chat.user_1 === senderId) {
        await supabase.from('scene_chats').update({ msg_count_1: chat.msg_count_1 + 1 }).eq('id', chatId);
      } else {
        await supabase.from('scene_chats').update({ msg_count_2: chat.msg_count_2 + 1 }).eq('id', chatId);
      }
    }
  }

  // Local fallback & update counts
  initLocalStore();
  const allMsgs = getStored<SceneMessage[]>(STORAGE_MSGS_KEY, []);
  allMsgs.push(newMsg);
  setStored(STORAGE_MSGS_KEY, allMsgs);

  const allChats = getStored<SceneChat[]>(STORAGE_CHATS_KEY, []);
  const chatIdx = allChats.findIndex(c => c.id === chatId);
  if (chatIdx >= 0) {
    if (allChats[chatIdx].user_1 === senderId) {
      allChats[chatIdx].msg_count_1 += 1;
    } else {
      allChats[chatIdx].msg_count_2 += 1;
    }
    setStored(STORAGE_CHATS_KEY, allChats);
  }

  notifyLocalChange('new_message', { message: newMsg, chatId });
  return newMsg;
}

export async function updateChatSocials(chatId: string, userId: string, socials: UserSocials): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { data: chat } = await supabase.from('scene_chats').select('*').eq('id', chatId).single();
    if (chat) {
      const updatedSocials = { ...chat.socials_shared, [userId]: socials };
      await supabase.from('scene_chats').update({ socials_shared: updatedSocials }).eq('id', chatId);
    }
  }

  initLocalStore();
  const allChats = getStored<SceneChat[]>(STORAGE_CHATS_KEY, []);
  const chatIdx = allChats.findIndex(c => c.id === chatId);
  if (chatIdx >= 0) {
    allChats[chatIdx].socials_shared = {
      ...(allChats[chatIdx].socials_shared || {}),
      [userId]: socials,
    };
    setStored(STORAGE_CHATS_KEY, allChats);
    notifyLocalChange('socials_updated', { chatId, userId, socials });
  }
}

// ----------------- AURA VOTING -----------------
export async function voteAura(targetUserId: string, voterUserId: string, delta: number): Promise<{ success: boolean; newAura?: number; message?: string }> {
  // Check if voter already voted for this user
  const votedPairs = getStored<string[]>(STORAGE_AURA_VOTES, []);
  const pairKey = `${voterUserId}->${targetUserId}`;

  if (votedPairs.includes(pairKey)) {
    return { success: false, message: 'You have already voted on this user’s aura!' };
  }

  let updatedAura = 5;

  if (isSupabaseConfigured && supabase) {
    const { data: targetUser } = await supabase.from('scene_users').select('scene_aura').eq('id', targetUserId).single();
    if (targetUser) {
      updatedAura = Math.max(-5, targetUser.scene_aura + delta);
      await supabase.from('scene_users').update({ scene_aura: updatedAura }).eq('id', targetUserId);
    }
  } else {
    const allUsers = getStored<SceneUser[]>(STORAGE_USERS_KEY, INITIAL_PEERS);
    const targetIdx = allUsers.findIndex(u => u.id === targetUserId);
    if (targetIdx >= 0) {
      allUsers[targetIdx].scene_aura = Math.max(-5, allUsers[targetIdx].scene_aura + delta);
      updatedAura = allUsers[targetIdx].scene_aura;
      setStored(STORAGE_USERS_KEY, allUsers);
    }
  }

  votedPairs.push(pairKey);
  setStored(STORAGE_AURA_VOTES, votedPairs);
  notifyLocalChange('aura_voted', { targetUserId, newAura: updatedAura });

  return { success: true, newAura: updatedAura };
}
