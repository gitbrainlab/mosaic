const XAI_BASE_URL = 'https://api.x.ai/v1';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export function hasXaiKey(): boolean {
  return Boolean(process.env.XAI_API_KEY || process.env.XAI_KEY);
}

export function modelFor(stage: 'refine' | 'draft' | 'iterate'): string {
  if (stage === 'refine') return process.env.XAI_MODEL_REFINE || process.env.XAI_REASONING_MODEL || process.env.XAI_RESEARCH_MODEL || 'grok-4.3';
  if (stage === 'iterate') return process.env.XAI_MODEL_ITERATE || process.env.XAI_REASONING_MODEL || process.env.XAI_RESEARCH_MODEL || 'grok-4.3';
  return process.env.XAI_MODEL_DRAFT || process.env.XAI_REASONING_MODEL || process.env.XAI_RESEARCH_MODEL || 'grok-4.3';
}

export async function chatComplete(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  const apiKey = process.env.XAI_API_KEY || process.env.XAI_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY/XAI_KEY is not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 45000);

  try {
    const body = {
      model: options.model || modelFor('draft'),
      messages,
      temperature: options.temperature ?? 0.35,
      max_tokens: options.maxTokens ?? 3000,
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    };

    const res = await fetch(`${XAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`XAI API error ${res.status}: ${text}`);
    }

    const data = await res.json() as ChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from XAI API');
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\n?([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return raw.slice(start, end + 1);

  return raw.trim();
}
