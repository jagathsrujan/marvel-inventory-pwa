// Fail-fast env validator. Usage: node scripts/check-env.mjs [--strict]
// Default checks the vars needed to boot (Supabase). --strict also requires LLM keys.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const strict = process.argv.includes('--strict');
const root = new URL('..', import.meta.url).pathname;

// Load .env.local / .env if present (setup writes .env.local; never commit either).
for (const f of ['.env.local', '.env']) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*(VITE_[A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const optional = [
  'VITE_QR_BASE',
  'VITE_OLLAMA_URL',
  'VITE_OLLAMA_MODEL',
  'VITE_LLM_PROVIDER',
  'VITE_LLM_BASE_URL',
  'VITE_LLM_API_KEY',
  'VITE_LLM_MODEL',
  'VITE_OCTOPART_KEY',
];
if (strict) required.push('VITE_LLM_BASE_URL', 'VITE_LLM_API_KEY', 'VITE_LLM_MODEL');

let fail = 0;
for (const k of required) {
  if (!process.env[k]) {
    console.error(`missing required env: ${k}`);
    fail = 1;
  }
}
for (const k of optional) {
  if (!process.env[k]) console.warn(`unset optional env: ${k}`);
}
if (process.env.VITE_APP_QR_BASE) {
  console.error('stale env: VITE_APP_QR_BASE is removed — use VITE_QR_BASE.');
  fail = 1;
}
process.exit(fail);
