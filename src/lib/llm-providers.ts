export interface LlmRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

const SYSTEM_PROMPT =
  'Normalize one spoken electronics-inventory note to JSON: {"name":"Canonical part name (<=48 chars)","specs":{"qty":"count if stated","home":"R1-S2-B3 code if stated","marking":"markings like 104 BC547"}}. Reply with ONLY that JSON.';

export function buildLlmRequest(opts: {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  transcript: string;
}): LlmRequest {
  const base = opts.baseUrl.replace(/\/$/, '');
  const body = {
    model: opts.model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: opts.transcript.slice(0, 500) },
    ],
  };
  void opts.provider;
  return {
    url: `${base}/chat/completions`,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
    body,
  };
}

export function extractLlmJson(raw: unknown): { name?: unknown; specs?: unknown } | null {
  if (typeof raw !== 'string') return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as { name?: unknown; specs?: unknown };
  } catch {
    return null;
  }
}
