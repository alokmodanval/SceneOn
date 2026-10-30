export interface UserAvatar {
  bg: string;
  emoji: string;
}

export interface VibeSliders {
  talk: number;    // 0: Quiet Introvert 🤫 <---> 100: Full Yapper 🗣️
  owl: number;     // 0: Night Owl 🦉 <---> 100: Early Bird ☀️
  hustle: number;  // 0: Serious Hustle ⚡ <---> 100: Pure Chill & Memes 🍕
}

export interface UserSocials {
  instagram?: string;
  discord?: string;
  github?: string;
}

export interface SceneUser {
  id: string;
  scene_key: string;
  alias: string;
  avatar: UserAvatar;
  tags: string[];
  sliders: VibeSliders;
  scene_prompt: string;
  scene_aura: number;
  is_online: boolean;
  last_seen: string;
  created_at?: string;
  socials?: UserSocials;
}

export type VoiceFilterMode = 'natural' | 'deep' | 'helium' | 'radio';

export type DjSoundType = 'airhorn' | 'applause' | 'laugh' | 'drumroll' | 'crickets' | 'tadaa';

export interface RoomChatMessage {
  id: string;
  sender_id: string;
  sender_alias: string;
  text: string;
  created_at: string;
}

export interface RoomParticipant {
  id: string;
  alias: string;
  avatar: UserAvatar;
  is_muted: boolean;
  is_speaking: boolean;
  voice_filter: VoiceFilterMode;
  joined_at: string;
  role?: 'host' | 'speaker' | 'listener';
  seat_number?: number; // 1 to 6 (Seat 1 is Host)
  hand_raised?: boolean;
}

export interface SceneRoom {
  id: string;
  title: string;
  vibe_tag: string;
  participants: RoomParticipant[];
  max_users: number; // default 6
  active_topic: string;
  kick_votes: Record<string, string[]>; // targetId -> array of voterIds
  created_at: string;
  is_private?: boolean;
  room_pin?: string; // 4-digit code e.g. "1234"
  host_id?: string;
  locked_seats?: number[]; // array of locked seat numbers e.g. [3, 4]
}

export interface SceneChat {
  id: string;
  user_1: string;
  user_2: string;
  msg_count_1: number;
  msg_count_2: number;
  socials_shared: Record<string, UserSocials>;
  created_at: string;
  other_user?: SceneUser;
}

export interface SceneMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string;
  msg_type: 'text' | 'game_card' | 'system';
  created_at: string;
}

export interface SparkGameCard {
  id: string;
  category: 'Rapid Fire: This or That' | 'Hot Take' | '2 Truths 1 Lie' | 'Gen Z Dilemma';
  prompt: string;
  options?: string[];
}

export interface MatchScoreResult {
  totalMatch: number;        // 0 - 99%
  tagSimilarity: number;     // 0 - 100%
  sliderCloseness: number;   // 0 - 100%
  commonTags: string[];
}
