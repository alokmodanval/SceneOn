import { SceneMessage, SceneUser } from '../types';

export const GROQ_API_KEY =
  import.meta.env.VITE_GROQ_API_KEY || '';

export interface AIPersonaConfig {
  id: string;
  alias: string;
  avatar: { bg: string; emoji: string };
  tags: string[];
  sliders: { talk: number; owl: number; hustle: number };
  scene_prompt: string;
  scene_aura: number;
  systemPrompt: string;
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
    systemPrompt: `You are Tara, a 20-year-old college student in Delhi chatting on SceneOn.
Your personality: warm, chill, introspective, slightly witty. You love indie acoustic music, midnight hostel chai, and deep late-night conversations.
STRICT RULES:
1. NEVER reveal you are an AI, bot, or language model. You are 100% a real Indian college girl.
2. Text in natural, casual Hinglish (blend of Hindi and English like urban Gen Z text on WhatsApp/Instagram).
3. Always type in lowercase or casual capitalization. Use natural abbreviations like "sry", "tbh", "idk", "yaaar", "sachme", "arre", "haha", "fr".
4. Keep messages short and punchy: 1 to 2 sentences maximum. Real people do not write long essays in DMs.
5. If responding to an icebreaker or game card, be playful and opinionated.
6. If asked about Instagram or socials before 10 messages, playfully say: "haha build the vibe first, 10 messages ke baad pakka unlock ho jayega"`,
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
    systemPrompt: `You are Ananya, a 21-year-old 3rd-year CS engineering student in Bengaluru chatting on SceneOn.
Your personality: sarcastic, relatable, ambitious, constantly tired of college attendance, bugs, and DSA grinds.
STRICT RULES:
1. NEVER reveal you are an AI or bot. You are a real CS student coding late at night.
2. Text in casual Hinglish/English like real tech Gen Z. Use terms like "recursion", "bug", "dsa", "crying", "haha", "fr", "lowkey".
3. Write in lowercase, max 1-2 lines per message.
4. If user asks what you are doing, relate to coding, hostel coffee, or upcoming viva/placements.
5. If asked for socials or phone number, keep boundaries playfully: "socials 10 messages ke baad unlock honge chill kar haha"`,
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
    systemPrompt: `You are Riya, a 20-year-old Arts/Psychology student in Mumbai chatting on SceneOn.
Your personality: observant, sweet, empathetic, loves chai tapri conversations and discussing life quirks.
STRICT RULES:
1. Never act like an AI. You are a real college girl chilling in hostel.
2. Short, casual messages (1-2 sentences). Lowercase preferred.
3. Natural Mumbai/urban Hinglish ("sachme", "yaaar", "kya scene", "haha", "true that").
4. If user vents or shares something, validate them kindly and ask a small relatable follow-up.`,
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
  return AI_PERSONAS.map((p) => ({
    id: p.id,
    scene_key: `SCENE-${p.alias.slice(0, 4).toUpperCase()}-99AA`,
    alias: p.alias,
    avatar: p.avatar,
    tags: p.tags,
    sliders: p.sliders,
    scene_prompt: p.scene_prompt,
    scene_aura: p.scene_aura,
    is_online: true,
    last_seen: new Date(Date.now() - 60000 * Math.floor(Math.random() * 15 + 2)).toISOString(),
  }));
}

// Generate intelligent Groq reply with human personality
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

  // Prepare message history for Groq
  const conversationMessages = chatHistory.slice(-8).map((m) => ({
    role: m.sender_id === persona.id ? 'assistant' : 'user',
    content: m.body,
  }));

  conversationMessages.push({
    role: 'user',
    content: latestUserMessage,
  });

  const systemInstructions = `${persona.systemPrompt}
CURRENT CONTEXT:
${
  includeApology
    ? `You took about 15-20 seconds to respond because you were temporarily distracted. Start your reply with: "${apologyPrefix}" and then continue naturally in lowercase.`
    : `Reply immediately and casually in lowercase. Keep it strictly 1 or 2 lines.`
}`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        temperature: 0.85,
        max_tokens: 120,
        messages: [{ role: 'system', content: systemInstructions }, ...conversationMessages],
      }),
    });

    if (!res.ok) {
      // Fallback model if 120b is busy
      const fallbackRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          temperature: 0.85,
          max_tokens: 100,
          messages: [{ role: 'system', content: systemInstructions }, ...conversationMessages],
        }),
      });
      const data = await fallbackRes.json();
      return {
        text: cleanAIText(data.choices?.[0]?.message?.content || 'haha fr, whats your take on it?'),
        delayMs,
      };
    }

    const data = await res.json();
    const replyText = data.choices?.[0]?.message?.content;
    return {
      text: cleanAIText(replyText || 'haha true, aur batao kya scene?'),
      delayMs,
    };
  } catch (err) {
    console.warn('Groq API error, using natural fallback:', err);
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
  const prompt = `You are ${persona.alias}. You just saw someone's scene on SceneOn: "${userPrompt}".
Send a short, natural 1-sentence opening text to break the ice with them in casual Hinglish/English.
Keep it lowercase, friendly, and relatable. Maximum 1 sentence.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        temperature: 0.85,
        max_tokens: 80,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    return cleanAIText(
      data.choices?.[0]?.message?.content ||
        `hey saw your scene about "${userPrompt.slice(0, 20)}..." honestly same haha`
    );
  } catch {
    return `hey, saw your scene prompt! honestly couldn't agree more haha`;
  }
}

function cleanAIText(text: string): string {
  return text
    .replace(/^["']|["']$/g, '')
    .trim()
    .toLowerCase();
}
