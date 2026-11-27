-- FriendsClub Cloudflare D1 Schema

CREATE TABLE IF NOT EXISTS scene_users (
  id TEXT PRIMARY KEY,
  scene_key TEXT UNIQUE NOT NULL,
  alias TEXT NOT NULL,
  avatar_json TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  sliders_json TEXT NOT NULL,
  scene_prompt TEXT NOT NULL,
  scene_aura INTEGER NOT NULL DEFAULT 5,
  is_online INTEGER NOT NULL DEFAULT 1,
  last_seen TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scene_users_last_seen ON scene_users(last_seen);
CREATE INDEX IF NOT EXISTS idx_scene_users_key ON scene_users(scene_key);

CREATE TABLE IF NOT EXISTS scene_rooms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  vibe_tag TEXT NOT NULL,
  participants_json TEXT NOT NULL DEFAULT '[]',
  max_users INTEGER NOT NULL DEFAULT 6,
  active_topic TEXT NOT NULL,
  kick_votes_json TEXT NOT NULL DEFAULT '{}',
  is_private INTEGER NOT NULL DEFAULT 0,
  room_pin TEXT,
  host_id TEXT,
  locked_seats_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scene_chats (
  id TEXT PRIMARY KEY,
  user_1 TEXT NOT NULL,
  user_2 TEXT NOT NULL,
  msg_count_1 INTEGER NOT NULL DEFAULT 0,
  msg_count_2 INTEGER NOT NULL DEFAULT 0,
  socials_shared_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(user_1, user_2)
);

CREATE TABLE IF NOT EXISTS scene_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  msg_type TEXT NOT NULL DEFAULT 'text',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scene_messages_chat ON scene_messages(chat_id, created_at);

CREATE TABLE IF NOT EXISTS aura_votes (
  pair_key TEXT PRIMARY KEY,
  target_user_id TEXT NOT NULL,
  voter_user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chess_games (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  time_control_ms INTEGER NOT NULL DEFAULT 300000,
  is_private INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting',
  white_id TEXT,
  white_alias TEXT,
  black_id TEXT,
  black_alias TEXT,
  winner TEXT,
  created_at TEXT NOT NULL
);
