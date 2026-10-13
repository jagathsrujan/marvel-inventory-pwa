import type { CategoryName } from '../../shared/types';
import { TAXONOMY_10 } from '../../shared/types';
import { buildLlmRequest, extractLlmJson } from './llm-providers';

export interface DecideInput {
  transcript: string;
  mpn: string;
  marking: string;
}

export interface DecideResult {
  category: CategoryName | null;
  p: number;
  merge_with_id: string | null;
  merge_p: number;
}

export interface CleanedText {
  name: string;
  specs: Record<string, string>;
}

const SUGGEST_P = 0.85;
const OLLAMA_TIMEOUT_MS = 3000;

const VALID_CATEGORIES = new Set<string>(TAXONOMY_10.map((t) => t.name));

function isCategoryName(v: unknown): v is CategoryName {
  return typeof v === 'string' && VALID_CATEGORIES.has(v);
}

function clampP(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function applyThreshold(r: DecideResult): DecideResult {
  if (r.p > SUGGEST_P && r.category !== null) return r;
  return { ...r, category: null };
}

interface KeywordRule {
  re: RegExp;
  category: CategoryName;
  p: number;
}

const KEYWORD_RULES: KeywordRule[] = [
  { re: /bc547|2n2222|irf830|1n4148|1n4007/, category: 'Diode/Transistor', p: 0.9 },
  { re: /transistor|diode|mosfet|rectifier/, category: 'Diode/Transistor', p: 0.78 },
  { re: /arduino|esp32|esp8266|nucleo|raspberry|stm32|jetson|basys|\bnano\b|\buno\b|\bmega\b/, category: 'Dev Board', p: 0.9 },
  { re: /dht11|lm35|hc-sr04|mq135|l298n|l293d|mpx\d|ultrasonic/, category: 'Module/Sensor', p: 0.9 },
  { re: /ne555|lm358|lm741|atmega|74hc/, category: 'Active/IC', p: 0.9 },
  { re: /555|op-?amp|\bic\b|timer ic|logic ic/, category: 'Active/IC', p: 0.78 },
  { re: /servo|sensor|pir|lcd|display|bluetooth module|camera module|motor driver/, category: 'Module/Sensor', p: 0.75 },
  { re: /\b104\b|10k|0603|0805|1206/, category: 'Passive (R/C/L)', p: 0.9 },
  { re: /resistor|capacitor|inductor|potentiometer|crystal|ferrite/, category: 'Passive (R/C/L)', p: 0.78 },
  { re: /dso|multimeter|oscilloscope|probe/, category: 'Measure/Test', p: 0.9 },
  { re: /power supply|signal gener|logic analyz|\bcro\b/, category: 'Measure/Test', p: 0.8 },
  { re: /printer|cnc|ender|creality|lathe/, category: 'Machine/Asset', p: 0.9 },
  { re: /wire|cable|jumper|connector|header|breadboard|perf board/, category: 'Wire/Cable/Connector', p: 0.8 },
  { re: /dremel|\bdrill\b|grinder|\bsaw\b/, category: 'Power Tool', p: 0.8 },
  { re: /solder|flux|wick|tweezer|cutter|plier|screwdriver|spanner|iron stand/, category: 'Hand Tool', p: 0.78 },
];

function keywordFallback(input: DecideInput): DecideResult {
  const hay = `${input.transcript} ${input.mpn} ${input.marking}`.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(hay)) {
      return { category: rule.category, p: rule.p, merge_with_id: null, merge_p: 0 };
    }
  }
  return { category: null, p: 0, merge_with_id: null, merge_p: 0 };
}

async function tryOllama(input: DecideInput): Promise<DecideResult | null> {
  const base = import.meta.env.VITE_OLLAMA_URL as string | undefined;
  if (!base) return null;
  const cats = TAXONOMY_10.map((t) => t.name).join(' | ');
  const prompt =
    `Classify one electronics part for inventory. Reply with ONLY this JSON, no other text: ` +
    `{"category":"<one of: ${cats}>","p":0.0-1.0 confidence,"merge_with_id":null,"merge_p":0}. ` +
    `Transcript: ${input.transcript.slice(0, 300)} MPN: ${input.mpn.slice(0, 60)} Marking: ${input.marking.slice(0, 60)}`;
  const res = await fetch(`${base.replace(/\/$/, '')}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: (import.meta.env.VITE_OLLAMA_MODEL as string | undefined) ?? 'laya',
      prompt,
      stream: false,
      format: 'json',
    }),
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { response?: unknown };
  if (typeof body.response !== 'string') return null;
  const start = body.response.indexOf('{');
  const end = body.response.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const parsed = JSON.parse(body.response.slice(start, end + 1)) as {
    category?: unknown;
    p?: unknown;
    merge_with_id?: unknown;
    merge_p?: unknown;
  };
  if (!isCategoryName(parsed.category)) return null;
  return {
    category: parsed.category,
    p: clampP(parsed.p),
    merge_with_id: typeof parsed.merge_with_id === 'string' ? parsed.merge_with_id : null,
    merge_p: clampP(parsed.merge_p),
  };
}

export async function decideCategory(input: DecideInput): Promise<DecideResult> {
  try {
    const local = await tryOllama(input);
    if (local) return applyThreshold(local);
  } catch {
    void 0;
  }
  return applyThreshold(keywordFallback(input));
}

const cleanupCache = new Map<string, CleanedText>();

const CLOUD_TIMEOUT_MS = 8000;

const FILLER =
  /\b(approx|approximately|about|left|remaining|pcs|pieces|nos|qty|quantity|home|shelf|rack|bin|strip|pouch|pouches|road|paise|please|item|this|that|there|here|with|from|into|slip|temp|number|wide|close|showing|photo)\b/gi;

function llmEnv(name: string): string | undefined {
  const v = (import.meta.env as unknown as Record<string, unknown>)[name];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

async function tryCloudCleanup(transcript: string): Promise<CleanedText | null> {
  const base = llmEnv('VITE_LLM_BASE_URL');
  const key = llmEnv('VITE_LLM_API_KEY');
  const model = llmEnv('VITE_LLM_MODEL') ?? 'inclusionai/ling-3.1-flash:free';
  const provider = llmEnv('VITE_LLM_PROVIDER') ?? 'openai-compatible';
  if (!base || !key) return null;
  const req = buildLlmRequest({ provider, baseUrl: base, apiKey: key, model, transcript });
  const res = await fetch(req.url, {
    method: 'POST',
    headers: req.headers,
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
  const raw = body.choices?.[0]?.message?.content;
  const parsed = extractLlmJson(raw);
  if (!parsed || typeof parsed.name !== 'string' || !parsed.name.trim()) return null;
  const specs: Record<string, string> =
    parsed.specs && typeof parsed.specs === 'object' && !Array.isArray(parsed.specs)
      ? Object.fromEntries(
          Object.entries(parsed.specs as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
            .map(([k, v]) => [k, String(v)]),
        )
      : {};
  return { name: parsed.name.trim().slice(0, 48), specs };
}

function localCleanup(transcript: string): CleanedText {
  const key = transcript.trim().toLowerCase();
  const hit = cleanupCache.get(key);
  if (hit) return hit;

  const qtyMatch =
    key.match(/(\d+)\s*(?:left|pcs|pieces|remaining|nos|qty|quantity)/) ??
    key.match(/approx\.?\s*(\d+)/) ??
    key.match(/quantity\s*(\d+)/);
  const homeMatch = transcript.match(/\b(r\d+\s*[- ]\s*s\d+\s*[- ]\s*b\d+)\b/i);
  const markingTokens = (transcript.toUpperCase().match(/\b[A-Z]{1,4}\d{2,5}[A-Z]?\b|\b\d{3,4}\b/g) ?? []).slice(0, 3);

  const firstClause = transcript.split(/[,.;]/)[0] ?? '';
  const cleaned = firstClause.replace(FILLER, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);
  const name = cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : 'Unnamed item';

  const specs: Record<string, string> = {};
  if (qtyMatch) specs['qty'] = qtyMatch[1];
  if (homeMatch) specs['home'] = homeMatch[1].replace(/\s+/g, '').toUpperCase();
  if (markingTokens.length > 0) specs['marking'] = markingTokens.join(' ');

  const out: CleanedText = { name, specs };
  cleanupCache.set(key, out);
  return out;
}

export async function cleanupText(transcript: string): Promise<CleanedText> {
  const key = transcript.trim().toLowerCase();
  const hit = cleanupCache.get(key);
  if (hit) return hit;
  try {
    const cloud = await tryCloudCleanup(transcript);
    if (cloud) {
      cleanupCache.set(key, cloud);
      return cloud;
    }
  } catch {
    void 0;
  }
  return localCleanup(transcript);
}

export function cleanupCacheSize(): number {
  return cleanupCache.size;
}
