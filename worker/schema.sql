-- ChessChat (by Tools4Genz) Cloudflare D1 Schema

CREATE TABLE IF NOT EXISTS scene_users (
  id TEXT PRIMARY KEY,
  scene_key TEXT UNIQUE NOT NULL,
  alias TEXT NOT NULL,
  username TEXT,
  avatar_json TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  sliders_json TEXT NOT NULL,
  scene_prompt TEXT NOT NULL,
  scene_aura INTEGER NOT NULL DEFAULT 5,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  is_online INTEGER NOT NULL DEFAULT 1,
  last_seen TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scene_users_last_seen ON scene_users(last_seen);
CREATE INDEX IF NOT EXISTS idx_scene_users_key ON scene_users(scene_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_users_username ON scene_users(username) WHERE username IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  user_1 TEXT NOT NULL,
  user_2 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requester_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_1, user_2)
);

CREATE INDEX IF NOT EXISTS idx_friendships_u1 ON friendships(user_1, status);
CREATE INDEX IF NOT EXISTS idx_friendships_u2 ON friendships(user_2, status);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  from_alias TEXT NOT NULL,
  from_username TEXT NOT NULL DEFAULT '',
  from_avatar_json TEXT NOT NULL DEFAULT '{}',
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chess_games (
  id TEXT PRIMARY KEY,
  time_control_ms INTEGER NOT NULL DEFAULT 300000,
  status TEXT NOT NULL DEFAULT 'completed',
  winner_side TEXT,
  white_id TEXT,
  white_alias TEXT,
  white_username TEXT NOT NULL DEFAULT '',
  white_avatar_json TEXT NOT NULL DEFAULT '{}',
  black_id TEXT,
  black_alias TEXT,
  black_username TEXT NOT NULL DEFAULT '',
  black_avatar_json TEXT NOT NULL DEFAULT '{}',
  pgn TEXT NOT NULL DEFAULT '',
  fen TEXT NOT NULL DEFAULT '',
  move_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  ended_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chess_games_white ON chess_games(white_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_chess_games_black ON chess_games(black_id, ended_at DESC);
