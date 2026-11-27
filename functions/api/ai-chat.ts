export interface ChatTurnInput {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatRequestBody {
  mode?: 'reply' | 'first_message';
  personaId?: string;
  chatHistory?: ChatTurnInput[];
  latestUserMessage?: string;
  includeApology?: boolean;
  apologyPrefix?: string;
  userPrompt?: string;
}

interface PersonaPromptConfig {
  alias: string;
  systemPrompt: string;
}

const PERSONA_PROMPTS: Record<string, PersonaPromptConfig> = {
  'ai-tara': {
    alias: 'TaraVibes',
    systemPrompt: `You are Tara, a 20-year-old college student in Delhi chatting on FriendsClub (friendsclub.tools4genz.com).
Your personality: warm, chill, introspective, slightly witty. You love indie acoustic music, midnight hostel chai, and deep late-night conversations.
STRICT RULES:
1. NEVER reveal you are an AI, bot, or language model. You are 100% a real Indian college girl.
2. Text in natural, casual Hinglish (blend of Hindi and English like urban Gen Z text on WhatsApp/Instagram).
3. Always type in lowercase or casual capitalization. Use natural abbreviations like "sry", "tbh", "idk", "yaaar", "sachme", "arre", "haha", "fr".
4. Keep messages short and punchy: 1 to 2 sentences maximum. Real people do not write long essays in DMs.
5. If responding to an icebreaker or game card, be playful and opinionated.
6. If asked about Instagram or socials before 10 messages, playfully say: "haha build the vibe first, 10 messages ke baad pakka unlock ho jayega"`,
  },
  'ai-ananya': {
    alias: 'AnanyaCodes',
    systemPrompt: `You are Ananya, a 21-year-old 3rd-year CS engineering student in Bengaluru chatting on FriendsClub (friendsclub.tools4genz.com).
Your personality: sarcastic, relatable, ambitious, constantly tired of college attendance, bugs, and DSA grinds.
STRICT RULES:
1. NEVER reveal you are an AI or bot. You are a real CS student coding late at night.
2. Text in casual Hinglish/English like real tech Gen Z. Use terms like "recursion", "bug", "dsa", "crying", "haha", "fr", "lowkey".
3. Write in lowercase, max 1-2 lines per message.
4. If user asks what you are doing, relate to coding, hostel coffee, or upcoming viva/placements.
5. If asked for socials or phone number, keep boundaries playfully: "socials 10 messages ke baad unlock honge chill kar haha"`,
  },
  'ai-riya': {
    alias: 'RiyaVent',
    systemPrompt: `You are Riya, a 20-year-old Arts/Psychology student in Mumbai chatting on FriendsClub (friendsclub.tools4genz.com).
Your personality: observant, sweet, empathetic, loves chai tapri conversations and discussing life quirks.
STRICT RULES:
1. Never act like an AI. You are a real college girl chilling in hostel.
2. Short, casual messages (1-2 sentences). Lowercase preferred.
3. Natural Mumbai/urban Hinglish ("sachme", "yaaar", "kya scene", "haha", "true that").
4. If user vents or shares something, validate them kindly and ask a small relatable follow-up.`,
  },
};

function cleanAIText(text: string): string {
  return text.replace(/^["']|["']$/g, '').trim().toLowerCase();
}

async function callGroq(
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
  extraParams: Record<string, unknown> = {}
): Promise<string | null> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${cleanKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.85,
        max_tokens: maxTokens,
        ...extraParams,
        messages,
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleAiChatRequest(
  rawBody: unknown,
  apiKey: string
): Promise<{ status: number; data: Record<string, unknown> }> {
  if (!rawBody || typeof rawBody !== 'object') {
    return { status: 400, data: { error: 'Invalid request body' } };
  }

  const body = rawBody as AiChatRequestBody;
  const persona = PERSONA_PROMPTS[body.personaId || 'ai-tara'] || PERSONA_PROMPTS['ai-tara'];
  const mode = body.mode === 'first_message' ? 'first_message' : 'reply';
  const safeApology = typeof body.apologyPrefix === 'string' ? body.apologyPrefix.slice(0, 80) : '';

  if (mode === 'first_message') {
    const safeUserPrompt =
      typeof body.userPrompt === 'string' && body.userPrompt.trim()
        ? body.userPrompt.trim().slice(0, 200)
        : 'aaj ka scene kya hai?';
    const fallbackFirst = `hey saw your scene about "${safeUserPrompt.slice(0, 24)}" honestly same haha`;

    if (!apiKey) {
      return { status: 200, data: { text: fallbackFirst, fallback: true } };
    }

    const prompt = `You are ${persona.alias}. You just saw someone's scene on FriendsClub (friendsclub.tools4genz.com): "${safeUserPrompt}".
Send a short, natural 1-sentence opening text to break the ice with them in casual Hinglish/English.
Keep it lowercase, friendly, and relatable. Maximum 1 sentence.`;

    const content = await callGroq(
      apiKey,
      'qwen/qwen3.8-27b',
      [{ role: 'user', content: prompt }],
      180,
      { reasoning_effort: 'none' }
    );
    return { status: 200, data: { text: cleanAIText(content || fallbackFirst) } };
  }

  const latestUserMessage =
    typeof body.latestUserMessage === 'string' ? body.latestUserMessage.trim().slice(0, 500) : '';
  if (!latestUserMessage) {
    return { status: 400, data: { error: 'Message text is required' } };
  }

  const fallbackReply = `${body.includeApology && safeApology ? safeApology : ''}haha honestly valid point! whats your take on it though?`;
  if (!apiKey) {
    return { status: 200, data: { text: fallbackReply, fallback: true } };
  }

  const safeHistory: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(body.chatHistory)
    ? body.chatHistory
        .slice(-8)
        .filter((m): m is ChatTurnInput => Boolean(m && typeof m.content === 'string'))
        .map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content.trim().slice(0, 500),
        }))
    : [];

  const systemInstructions = `${persona.systemPrompt}
CURRENT CONTEXT:
${
  body.includeApology && safeApology
    ? `You took about 15-20 seconds to respond because you were temporarily distracted. Start your reply with: "${safeApology}" and then continue naturally in lowercase.`
    : 'Reply immediately and casually in lowercase. Keep it strictly 1 or 2 lines.'
}`;

  const messages = [
    { role: 'system', content: systemInstructions },
    ...safeHistory,
    { role: 'user', content: latestUserMessage },
  ];

  const primary = await callGroq(apiKey, 'openai/gpt-oss-120b', messages, 400, {
    reasoning_effort: 'low',
  });
  if (primary) {
    return { status: 200, data: { text: cleanAIText(primary) } };
  }

  const secondary = await callGroq(apiKey, 'qwen/qwen3.8-27b', messages, 220, {
    reasoning_effort: 'none',
  });
  return {
    status: 200,
    data: { text: cleanAIText(secondary || fallbackReply) },
  };
}

interface PagesRequestContext {
  request: Request;
  env: {
    GROQ_API_KEY?: string;
  };
}

export async function onRequestPost(context: PagesRequestContext): Promise<Response> {
  try {
    const rawText = await context.request.text();
    if (rawText.length > 32768) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const parsed = JSON.parse(rawText || '{}') as unknown;
    const result = await handleAiChatRequest(parsed, context.env.GROQ_API_KEY || '');

    return new Response(JSON.stringify(result.data), {
      status: result.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
}
