import { SceneUser, UserAvatar, VibeSliders } from '../types';
import { AVATAR_EMOJIS, AVATAR_GRADIENTS } from './constants';
import { upsertSceneUser } from './supabase';

const CURRENT_USER_KEY = 'sceneon_current_user';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateSceneKey(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // exclude ambiguous 0/O, 1/I
  const part1 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `SCENE-${part1}-${part2}`;
}

const ALIAS_PREFIXES = [
  'Midnight', 'Chai', 'Desi', 'Neon', 'LoFi', 'Cyber', 'Chill',
  'Drip', 'Glitch', 'Tapri', 'Shadow', 'Cosmic', 'Pixel', 'Sonic', 'Urban'
];

const ALIAS_SUFFIXES = [
  'Yapper', 'Coder', 'Soul', 'Vibe', 'Hustler', 'Hacker', 'Nomad',
  'Rebel', 'Aura', 'Phantom', 'Monk', 'Echo', 'Drifter', 'Pilot', 'Sensei'
];

export function generateRandomAlias(): string {
  const prefix = ALIAS_PREFIXES[Math.floor(Math.random() * ALIAS_PREFIXES.length)];
  const suffix = ALIAS_SUFFIXES[Math.floor(Math.random() * ALIAS_SUFFIXES.length)];
  return `${prefix}${suffix}`;
}

export function generateRandomAvatar(): UserAvatar {
  const bg = AVATAR_GRADIENTS[Math.floor(Math.random() * AVATAR_GRADIENTS.length)];
  const emoji = AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)];
  return { bg, emoji };
}

export function getCurrentUser(): SceneUser | null {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading current user:', err);
    return null;
  }
}

export function saveCurrentUser(user: SceneUser): void {
  try {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    window.dispatchEvent(new CustomEvent('sceneon-auth-change', { detail: { user } }));
  } catch (err) {
    console.error('Error saving current user:', err);
  }
}

export function createNewSceneUser(params: {
  alias: string;
  avatar: UserAvatar;
  tags: string[];
  sliders: VibeSliders;
  scene_prompt: string;
}): SceneUser {
  const newUser: SceneUser = {
    id: generateUUID(),
    scene_key: generateSceneKey(),
    alias: params.alias.trim() || generateRandomAlias(),
    avatar: params.avatar,
    tags: params.tags,
    sliders: params.sliders,
    scene_prompt: params.scene_prompt.trim() || 'Aaj ka scene kya hai? Let’s connect!',
    scene_aura: 5, // Default start aura
    is_online: true,
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  saveCurrentUser(newUser);
  upsertSceneUser(newUser).catch(console.error);
  return newUser;
}

// 24-Hour Freshness Check
export function isFreshWithin24Hours(lastSeenIso: string): boolean {
  try {
    const lastSeenTime = new Date(lastSeenIso).getTime();
    const now = Date.now();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    return now - lastSeenTime <= twentyFourHoursMs;
  } catch {
    return true;
  }
}

// Format relative time: e.g. "Just now", "5m ago", "2h ago"
export function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  } catch {
    return 'Recently';
  }
}
