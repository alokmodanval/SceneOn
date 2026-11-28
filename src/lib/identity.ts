import { SceneUser, UserAvatar, VibeSliders } from '../types';
import { AVATAR_EMOJIS, AVATAR_GRADIENTS } from './constants';
import { upsertSceneUser } from './supabase';

const CURRENT_USER_KEY = 'sceneon_current_user';

export function secureRandomInt(max: number): number {
  if (max <= 0) return 0;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0xffffffff / max) * max;
    let rand = 0;
    do {
      crypto.getRandomValues(buf);
      rand = buf[0];
    } while (rand >= limit);
    return rand % max;
  }
  return Math.floor(Math.random() * max);
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function generateSceneKey(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // exclude ambiguous 0/O, 1/I
  const part1 = Array.from({ length: 4 }, () => chars[secureRandomInt(chars.length)]).join('');
  const part2 = Array.from({ length: 4 }, () => chars[secureRandomInt(chars.length)]).join('');
  return `SCENE-${part1}-${part2}`;
}

export function generateSecurePin(): string {
  return String(1000 + secureRandomInt(9000));
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
  const prefix = ALIAS_PREFIXES[secureRandomInt(ALIAS_PREFIXES.length)];
  const suffix = ALIAS_SUFFIXES[secureRandomInt(ALIAS_SUFFIXES.length)];
  return `${prefix}${suffix}`;
}

export function generateRandomAvatar(): UserAvatar {
  const bg = AVATAR_GRADIENTS[secureRandomInt(AVATAR_GRADIENTS.length)];
  const emoji = AVATAR_EMOJIS[secureRandomInt(AVATAR_EMOJIS.length)];
  return { bg, emoji };
}

export function getCurrentUser(): SceneUser | null {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SceneUser;
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.alias !== 'string') {
      return null;
    }
    return parsed;
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

export function clearCurrentUser(): void {
  try {
    localStorage.removeItem(CURRENT_USER_KEY);
    window.dispatchEvent(new CustomEvent('sceneon-auth-change', { detail: { user: null } }));
  } catch (err) {
    console.error('Error clearing current user:', err);
  }
}

export function normalizeUsernameInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);
}

export function suggestUsernameFromName(name: string): string {
  const base = normalizeUsernameInput(name.replace(/\s+/g, '_')).slice(0, 14) || 'player';
  const suffix = String(10 + secureRandomInt(89));
  return `${base.length < 3 ? `chess_${base}` : base}_${suffix}`;
}

export function createNewSceneUser(params: {
  alias: string;
  username?: string;
  avatar: UserAvatar;
  tags: string[];
  sliders: VibeSliders;
  scene_prompt: string;
}): SceneUser {
  const safeAlias = params.alias.trim().slice(0, 24) || generateRandomAlias();
  const safeUsername =
    normalizeUsernameInput(params.username || '') || suggestUsernameFromName(safeAlias);
  const safePrompt =
    params.scene_prompt.trim().slice(0, 160) || 'Ready for Chess + Video Chat!';

  const newUser: SceneUser = {
    id: generateUUID(),
    scene_key: generateSceneKey(),
    alias: safeAlias,
    username: safeUsername,
    avatar: params.avatar,
    tags: (params.tags || []).slice(0, 6),
    sliders: params.sliders,
    scene_prompt: safePrompt,
    scene_aura: 5,
    wins: 0,
    losses: 0,
    draws: 0,
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
    if (Number.isNaN(lastSeenTime)) return true;
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
    const diffMs = Math.max(0, Date.now() - new Date(isoString).getTime());
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
