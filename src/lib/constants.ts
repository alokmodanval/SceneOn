import { SparkGameCard } from '../types';

export const SCENE_TAG_CATEGORIES = [
  {
    category: 'Vibe & Talks',
    tags: [
      '🌙 3AM Rants',
      '☕ Chai & Bakchodi',
      '🧠 Deep Filosofi',
      '💔 Vent / Heartbreak',
      '😂 Dank Memes',
    ],
  },
  {
    category: 'Tech & Hustle',
    tags: [
      '💻 Coding & Dev',
      '🚀 Startup Scene',
      '📚 Exam / Placement Grind',
      '🤖 AI & Tech',
    ],
  },
  {
    category: 'Culture & Play',
    tags: [
      '🎧 Desi Hip-Hop',
      '🎵 Lo-Fi & Indie',
      '🎮 Valorant / BGMI',
      '🎬 Anime & Movies',
    ],
  },
];

export const ALL_TAGS = SCENE_TAG_CATEGORIES.flatMap((c) => c.tags);

export const AVATAR_GRADIENTS = [
  'from-violet-600 to-indigo-900',
  'from-pink-500 to-rose-700',
  'from-lime-400 to-emerald-700',
  'from-cyan-400 to-blue-700',
  'from-amber-400 to-orange-600',
  'from-fuchsia-600 to-purple-800',
  'from-teal-400 to-slate-800',
];

export const AVATAR_EMOJIS = [
  '⚡', '👾', '🚀', '🔥', '🎧', '☕', '🕶️', '💀', '🍕', '🐱', '✨', '🌪️', '🧸', '👽', '🎯'
];

export const ICEBREAKER_PRESETS = [
  'Grinding DSA & Web3, need late-night accountability partner.',
  'Bored in hostel at 2 AM, let’s debate why Desi Hip-Hop hits different.',
  'Tell me your biggest unpopular opinion that could get you cancelled.',
  'Building an AI side-project, looking for savage roast & feedback.',
  'What is one life lesson you learned the hard way this semester?',
  'Recommend one underground indie song nobody else knows about.'
];

export const SPARK_GAME_CARDS: SparkGameCard[] = [
  {
    id: 'sgc-1',
    category: 'Rapid Fire: This or That',
    prompt: 'Hostel Tapri Chai ☕ OR ₹350 Iced Matcha Latte 🍵?',
    options: ['Tapri Chai ☕', 'Iced Matcha 🍵']
  },
  {
    id: 'sgc-2',
    category: 'Hot Take',
    prompt: 'Most corporate 9-to-5s are just high school with salaries and Slack emojis. Agree or Disagree?'
  },
  {
    id: 'sgc-3',
    category: 'Rapid Fire: This or That',
    prompt: 'Silent Night Coding 🌙 OR High-Energy Morning Flow ☀️?',
    options: ['Night Owl 🌙', 'Early Bird ☀️']
  },
  {
    id: 'sgc-4',
    category: '2 Truths 1 Lie',
    prompt: 'Tell 3 quick facts about yourself (2 true, 1 cap). Let your match guess the cap!'
  },
  {
    id: 'sgc-5',
    category: 'Gen Z Dilemma',
    prompt: 'If you had ₹10 Lakhs right now, would you invest it in crypto/startups or travel solo for 6 months?'
  },
  {
    id: 'sgc-6',
    category: 'Hot Take',
    prompt: 'Dating apps are cooked. Meeting people organically or over shared random late-night chats is 10x better.'
  }
];

export const TOPIC_DECK = [
  'Hostel vs Home food: Which one humbled you more?',
  'What project did you abandon halfway through this month?',
  'What is that one song you will never skip no matter what mood you are in?',
  'Share 1 tip or ritual that keeps you focused during 3 AM sprints.',
  'What is a popular trend right now that makes zero sense to you?',
  'If you could automate one daily chore for the rest of your life, what is it?',
  'Cold DM that actually changed your career trajectory or network?',
  'What is the cringiest thing you did in 2020 lockdown?',
  'Android vs iOS: Does phone snobbery actually still matter in 2026?'
];
