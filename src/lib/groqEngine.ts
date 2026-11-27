import { SceneMessage, SceneUser } from '../types';
import { buildApiUrl } from './backendConfig';

export const AI_PERSONAS_ENABLED =
  import.meta.env.VITE_ENABLE_AI_PERSONAS !== 'false';

export interface AIPersonaConfig {
  id: string;
  alias: string;
  avatar: { bg: string; emoji: string };
  tags: string[];
  sliders: { talk: number; owl: number; hustle: number };
  scene_prompt: string;
  scene_aura: number;
  excuses: string[];
}

export const AI_PERSONAS: AIPersonaConfig[] = [
  {
    id: 'ai-tara',
    alias: 'TaraVibes',
    avatar: { bg: 'from-pink-500 to-rose-700', emoji: '✨' },
    tags: ['🌙 3AM Rants', '🎵 Lo-Fi & Indie', '☕ Chai & Bakchodi'],
    sliders: { talk: 72, owl: 12, hustle: 45 },
    scene_prompt:
      'listening to prateek kuhad at 2 am and contemplating life decisions... drop your comfort track 🎵',
    scene_aura: 8,
    excuses: [
      'sry yaaar roommate se baat karne lag gayi thi haha',
      'sry assignment submit kar rahi thi deadline thi 😭',
      'wait chai lene chali gayi thi hostel tapri pe haha',
      'hey sry notifications mute the phone pe!',
      'sry library me thi phone silent tha',
    ],
  },
  {
    id: 'ai-ananya',
    alias: 'AnanyaCodes',
    avatar: { bg: 'from-violet-600 to-indigo-900', emoji: '🎧' },
    tags: ['💻 Coding & Dev', '📚 Exam / Placement Grind', '😂 Dank Memes'],
    sliders: { talk: 58, owl: 18, hustle: 80 },
    scene_prompt:
      'debugging Next.js while drowning in black coffee. someone please tell me semester ends soon 😭',
    scene_aura: 11,
    excuses: [
      'sry ek bug me phas gayi thi 1 ghante se 😭',
      'sry warden aayi thi room check karne haha',
      'wait project push kar rahi thi git pe',
      'sry headphones pe lofi sunte sunte notification miss ho gayi',
    ],
  },
  {
    id: 'ai-riya',
    alias: 'RiyaVent',
    avatar: { bg: 'from-teal-400 to-slate-800', emoji: '☕' },
    tags: ['💔 Vent / Heartbreak', '🧠 Deep Filosofi', '☕ Chai & Bakchodi'],
    sliders: { talk: 65, owl: 25, hustle: 40 },
    scene_prompt:
      'hostel tapri chai is literally the only constant keeping me sane this semester tbh',
    scene_aura: 9,
    excuses: [
      'sry yaaar call aa gaya tha mummy ka haha',
      'sry mess ka dinner lene gayi thi',
      'wait roommate ke saath thoda rant session chal raha tha 💀',
      'sry phone charge me laga tha!',
    ],
  },
];

// Helper to convert AIPersonaConfig to SceneUser object
export function getAIPersonaUsers(): SceneUser[] {
  return AI_PERSONAS.map((p, idx) => ({
    id: p.id,
    scene_key: `SCENE-${p.alias.slice(0, 4).toUpperCase()}-99AA`,
    alias: p.alias,
    avatar: p.avatar,
    tags: p.tags,
    sliders: p.sliders,
    scene_prompt: p.scene_prompt,
    scene_aura: p.scene_aura,
    is_online: true,
    last_seen: new Date(Date.now() - 60000 * (idx * 4 + 2)).toISOString(),
  }));
}

// Generate intelligent AI reply via server-side /api/ai-chat proxy (keeps API keys off client)
export async function generateGroqReply(
  personaId: string,
  chatHistory: SceneMessage[],
  latestUserMessage: string
): Promise<{ text: string; delayMs: number }> {
  const persona = AI_PERSONAS.find((p) => p.id === personaId) || AI_PERSONAS[0];

  // Calculate realistic human delay (between 6s and 16s)
  const delayMs = Math.floor(Math.random() * 10000 + 6000);
  const includeApology = delayMs > 11000 && Math.random() > 0.45;
  const apologyPrefix = includeApology
    ? persona.excuses[Math.floor(Math.random() * persona.excuses.length)] + ', '
    : '';

  const conversationMessages = chatHistory.slice(-8).map((m) => ({
    role: m.sender_id === persona.id ? ('assistant' as const) : ('user' as const),
    content: m.body.slice(0, 500),
  }));

  try {
    const res = await fetch(buildApiUrl('/api/ai-chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'reply',
        personaId: persona.id,
        chatHistory: conversationMessages,
        latestUserMessage: latestUserMessage.slice(0, 500),
        includeApology,
        apologyPrefix,
      }),
    });

    if (!res.ok) {
      throw new Error(`AI proxy returned ${res.status}`);
    }

    const data = (await res.json()) as { text?: string };
    return {
      text: cleanAIText(data.text || 'haha true, aur batao kya scene?'),
      delayMs,
    };
  } catch (err) {
    console.warn('AI proxy fallback active:', err);
    return {
      text: `${apologyPrefix}haha honestly valid point! whats your take on it though?`,
      delayMs,
    };
  }
}

// Generate organic first message from an AI persona to a newly set up user
export async function generateFirstMessageToUser(
  persona: AIPersonaConfig,
  userPrompt: string
): Promise<string> {
  try {
    const res = await fetch(buildApiUrl('/api/ai-chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'first_message',
        personaId: persona.id,
        userPrompt: userPrompt.slice(0, 200),
      }),
    });

    if (!res.ok) {
      throw new Error(`AI proxy returned ${res.status}`);
    }

    const data = (await res.json()) as { text?: string };
    return cleanAIText(
      data.text || `hey saw your scene about "${userPrompt.slice(0, 20)}..." honestly same haha`
    );
  } catch {
    return 'hey, saw your scene prompt! honestly couldnt agree more haha';
  }
}

function cleanAIText(text: string): string {
  return text.replace(/^["']|["']$/g, '').trim().toLowerCase();
}
