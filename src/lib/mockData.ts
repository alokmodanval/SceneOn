import { SceneRoom, SceneUser } from '../types';

export const INITIAL_ROOMS: SceneRoom[] = [
  {
    id: 'room-1',
    title: '☕ Late Night Tapri',
    vibe_tag: '☕ Chai & Bakchodi',
    max_users: 6,
    active_topic: 'Hostel vs Home food: Which one humbled you more?',
    kick_votes: {},
    created_at: new Date().toISOString(),
    participants: [],
  },
  {
    id: 'room-2',
    title: '💻 Coders & Builders Lounge',
    vibe_tag: '💻 Coding & Dev',
    max_users: 6,
    active_topic: 'What project did you abandon halfway through this month?',
    kick_votes: {},
    created_at: new Date().toISOString(),
    participants: [],
  },
  {
    id: 'room-3',
    title: '🎧 Lo-Fi & Music Jam',
    vibe_tag: '🎵 Lo-Fi & Indie',
    max_users: 6,
    active_topic: 'What is that one song you will never skip no matter what?',
    kick_votes: {},
    created_at: new Date().toISOString(),
    participants: [],
  },
  {
    id: 'room-4',
    title: '📚 Silent Study Pod',
    vibe_tag: '📚 Exam / Placement Grind',
    max_users: 6,
    active_topic: 'Share 1 tip that keeps you focused during late-night sprints.',
    kick_votes: {},
    created_at: new Date().toISOString(),
    participants: [],
  },
  {
    id: 'room-5',
    title: '🔥 3AM Unfiltered Rants',
    vibe_tag: '🌙 3AM Rants',
    max_users: 6,
    active_topic: 'What is a popular trend right now that makes zero sense to you?',
    kick_votes: {},
    created_at: new Date().toISOString(),
    participants: [],
  },
];

// No fake dummy peers — clean real-user state only
export const INITIAL_PEERS: SceneUser[] = [];
