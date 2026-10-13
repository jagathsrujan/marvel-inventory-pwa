# AGENTS.md — One-Link Setup for MARVEL PWA

> Copy-paste prompt for any AI agent: "Set up this repo: clone it, run `./scripts/agent-setup.sh`, and get it live on MY accounts."

## The one command

```bash
./scripts/agent-setup.sh
# alias: npm run setup
```

## What you (the agent) must do, in order

1. **Prereqs** — check `node>=20 npm>=10 git gh supabase vercel ollama curl psql`. Print what's missing + one-line install hint (brew/npm). Do not continue until node+npm+git exist.
2. **GitHub (their account)** — `gh auth status` else `gh auth login`. If this checkout is detached/no-remote, `gh repo create --private --source=. --push`. Never push to someone else's remote.
3. **Supabase Cloud only** — `supabase login` → ask for project ref (or pick from `supabase projects list`) → `supabase link --project-ref <REF>` → `supabase db push` → run `supabase/seed.sql` (idempotent) → run `supabase/bootstrap-storage.sql` → create storekeeper login + `supabase/bootstrap-admin.sql` with their email. Write `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` to `.env.local`. No self-host, no `supabase start`.
4. **Ollama (their admin machine)** — detect hardware (`sysctl`/`system_profiler` on mac, `/proc/meminfo`+`nproc`+`nvidia-smi -L` on linux) → recommend: `<=8GB RAM or no GPU` → `laya` default; `16GB+` → ask to confirm `laya` vs `qwen2.5:3b`-class. `ollama pull <model>` → ensure `ollama serve` → set `VITE_OLLAMA_URL=http://localhost:11434` + `VITE_OLLAMA_MODEL=<picked>` → test `POST /api/generate` taxonomy JSON. Keyword fallback in `src/lib/ai.ts` covers failure — report it, don't block.
5. **Cloud LLM (their provider + key)** — STOP and ask: provider name + docs URL + API key (masked input) + optional model id. Fetch the docs URL, derive `VITE_LLM_BASE_URL` + `VITE_LLM_MODEL`. Default: keep OpenAI-compatible `POST {BASE}/chat/completions` with Bearer (see `src/lib/llm-providers.ts`). If docs show a non-compatible shape, add one adapter function in `src/lib/llm-providers.ts` selected by `VITE_LLM_PROVIDER`, patch `src/lib/ai.ts` only at the `buildLlmRequest` call site. Validate with one `cleanupText("10k resistor strip")`. Write to `.env.local` + `vercel env add` (production). Never print the key.
6. **Vercel (their account)** — `vercel login` → `vercel link` → `vercel env add` for `VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_LLM_BASE_URL VITE_LLM_API_KEY VITE_LLM_MODEL VITE_QR_BASE` (production) → `vercel --prod` → verify `/`, `/i/<lot>`, `/l/<code>`, `/m/<id>` return 200 (rewrites in `vercel.json`).
7. **Verify + report** — `npm ci && npm run check-env && npm run build`. Check Supabase: 10 categories, 8 locations, 13 items/lots, 5 members. Print READINESS REPORT: live URL, Supabase ref, Ollama model, LLM provider/model (key masked `…abcd`), seed counts, next steps (print location QRs, run `scripts/trial-30-items.md`).

## Rules

- Never commit `.env`, `.env.local`, or any secret. Never echo keys to logs.
- Supabase Cloud only. If the user asks for local/self-host, stop and say it's out of scope for this script.
- Each phase is idempotent — re-running the script resumes safely.
- If a CLI is missing, install via documented one-liner then continue. If a login needs a browser, stop and ask the user.
- End state: smoke-tested Vercel URL + readiness checklist. Anything manual (M220 printer, USB scanner, label sticking) goes in the report as next steps, not blockers.

## Troubleshooting

See `docs/SETUP-TROUBLESHOOTING.md` for per-CLI auth failures, wrong project ref, RLS/seed errors, Ollama port busy, Vercel env drift, QR 404s.
