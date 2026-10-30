-- ==============================================================================
-- SceneOn (by Tools4Genz) — Production Supabase Database Schema
-- Target Production Domain: scene.tools4genz.com
-- Zero-Login Anonymous Architecture with Realtime Broadcast & Row Level Security
-- ==============================================================================

-- 1. Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Clean previous tables if resetting
DROP TABLE IF EXISTS scene_messages CASCADE;
DROP TABLE IF EXISTS scene_chats CASCADE;
DROP TABLE IF EXISTS scene_rooms CASCADE;
DROP TABLE IF EXISTS scene_users CASCADE;

-- 3. SCENE USERS TABLE
CREATE TABLE scene_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_key TEXT UNIQUE NOT NULL,
    alias TEXT NOT NULL,
    avatar JSONB NOT NULL DEFAULT '{"bg": "from-violet-600 to-indigo-900", "emoji": "⚡"}'::jsonb,
    tags TEXT[] NOT NULL DEFAULT '{}',
    sliders JSONB NOT NULL DEFAULT '{"talk": 50, "owl": 50, "hustle": 50}'::jsonb,
    scene_prompt TEXT NOT NULL DEFAULT 'Aaj ka scene kya hai? Let''s vibe!',
    scene_aura INT NOT NULL DEFAULT 5,
    is_online BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. SCENE ROOMS TABLE (Live Voice Scenes Micro-Pods, Max 6 Users)
CREATE TABLE scene_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    vibe_tag TEXT NOT NULL DEFAULT '☕ Chai & Chill',
    participants JSONB NOT NULL DEFAULT '[]'::jsonb,
    max_users INT NOT NULL DEFAULT 6,
    active_topic TEXT DEFAULT 'If you could erase one social media app forever, which one and why?',
    kick_votes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. SCENE CHATS TABLE (1-on-1 Progressive Trust Conversations)
CREATE TABLE scene_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_1 UUID NOT NULL REFERENCES scene_users(id) ON DELETE CASCADE,
    user_2 UUID NOT NULL REFERENCES scene_users(id) ON DELETE CASCADE,
    msg_count_1 INT NOT NULL DEFAULT 0,
    msg_count_2 INT NOT NULL DEFAULT 0,
    socials_shared JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_pair UNIQUE(user_1, user_2)
);

-- 6. SCENE MESSAGES TABLE
CREATE TABLE scene_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES scene_chats(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES scene_users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    msg_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'game_card', 'system'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. PERFORMANCE INDEXES
CREATE INDEX idx_scene_users_key ON scene_users(scene_key);
CREATE INDEX idx_scene_users_last_seen ON scene_users(last_seen DESC);
CREATE INDEX idx_scene_users_aura ON scene_users(scene_aura);
CREATE INDEX idx_scene_chats_users ON scene_chats(user_1, user_2);
CREATE INDEX idx_scene_messages_chat ON scene_messages(chat_id, created_at ASC);

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- Zero-Login Anonymous public access for all authenticated & anon requests
ALTER TABLE scene_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE scene_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE scene_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE scene_messages ENABLE ROW LEVEL SECURITY;

-- Allow anon to select, insert, update users
CREATE POLICY "Anon Full Access Users" ON scene_users
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Allow anon to select, insert, update rooms
CREATE POLICY "Anon Full Access Rooms" ON scene_rooms
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Allow anon to participate in chats
CREATE POLICY "Anon Full Access Chats" ON scene_chats
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Allow anon to read and post messages
CREATE POLICY "Anon Full Access Messages" ON scene_messages
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 9. REALTIME REPLICATION (For WebRTC Signaling & Live Chat)
-- Add all tables to supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE scene_users;
ALTER PUBLICATION supabase_realtime ADD TABLE scene_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE scene_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE scene_messages;

-- 10. SEED DEFAULT ROOMS
INSERT INTO scene_rooms (id, title, vibe_tag, active_topic, max_users)
VALUES 
    (gen_random_uuid(), '☕ Late Night Tapri', '☕ Chai & Bakchodi', 'Hostel vs Home food: Which one humbled you more?', 6),
    (gen_random_uuid(), '💻 Coders & Builders Lounge', '💻 Coding & Dev', 'What project did you abandon halfway through this month?', 6),
    (gen_random_uuid(), '🎧 Lo-Fi & Music Jam', '🎵 Lo-Fi & Indie', 'What is that one song you will never skip no matter what?', 6),
    (gen_random_uuid(), '📚 Silent Study Pod', '📚 Exam / Placement Grind', 'Share 1 tip that keeps you focused during late-night sprints.', 6),
    (gen_random_uuid(), '🔥 3AM Unfiltered Rants', '🌙 3AM Rants', 'What is a popular trend right now that makes zero sense to you?', 6);
