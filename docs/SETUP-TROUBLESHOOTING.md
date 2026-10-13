# Setup troubleshooting

Manual fallback for any `npm run setup` phase. Never paste secrets into issues or logs.

## CLIs missing

- `gh`: `brew install gh` (mac/linux) or `winget install GitHub.cli`. Then `gh auth login`.
- `supabase`: `brew install supabase/tap/supabase`. Then `supabase login`.
- `vercel`: `npm i -g vercel`. Then `vercel login`.
- `ollama`: `curl -fsSL https://ollama.com/install.sh | sh`. Then `ollama pull laya`.
- `psql`: `brew install libpq` (mac) or `apt install postgresql-client` (linux). Without it, paste SQL via Dashboard SQL Editor when the script asks.

## GitHub: auth / remote

- `gh auth status` fails: run `gh auth login`, pick HTTPS, paste token.
- "no git remote": script offers `gh repo create --private --source=. --push`. If that fails, create the repo on github.com first, then `git remote add origin <url> && git push -u origin main`.

## Supabase: wrong project ref / link

- "project ref not found": copy the 20-char ref from the dashboard URL (`supabase.com/dashboard/project/<REF>`), then `supabase link --project-ref <REF>`.
- `supabase db push` shows pending migrations: run from repo root (`marvel-pwa/`), check `supabase/config.toml` exists, re-run `supabase link` first.
- RLS blocks seed inserts: seed uses the service role via `psql`/dashboard — if rows are missing, re-run `supabase/seed.sql` in SQL Editor (it's idempotent).
- Buckets missing: run `supabase/bootstrap-storage.sql`, then Storage -> confirm `item-photos`, `shelf-photos`, `condition-photos` are public.
- No login works: Auth -> Users -> add user, copy their uuid, edit `supabase/bootstrap-admin.sql` (`<AUTH_UUID>` + email), run it.

## Env drift

- App throws `Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY`: copy `.env.example` to `.env.local` and fill both, or re-run setup phase 20.
- `VITE_APP_QR_BASE` does nothing: stale name, use `VITE_QR_BASE`. `npm run check-env` fails on the stale name.
- Vercel shows blank/old config: `vercel env add <KEY> production`, then `vercel --prod` again. Compare with `.env.local` keys.

## Ollama: port busy / model fails

- `address already in use :11434`: another `ollama serve` is running — reuse it, don't start a second.
- `ollama pull` slow/fails: check disk + net, retry, or keep `VITE_OLLAMA_MODEL=laya` (smallest). App still classifies via keyword fallback in `src/lib/ai.ts`.
- Ping fails but model pulled: `curl -m 5 -X POST localhost:11434/api/generate -d '{"model":"<m>","prompt":"hi","stream":false}'`. If that fails, `ollama serve` in one terminal, app in another.

## Cloud LLM: key / shape errors

- 401: key wrong or wrong project — regenerate at the provider, `vercel env add VITE_LLM_API_KEY production`, redeploy.
- 404 model: model id retired — fetch the provider docs URL again, update `VITE_LLM_MODEL`.
- Non-JSON or schema errors: add one adapter in `src/lib/llm-providers.ts` keyed by `VITE_LLM_PROVIDER` (see `AGENTS.md` phase 5), keep `openai-compatible` default untouched.
- Offline is fine without it: `localCleanup` in `src/lib/ai.ts` handles voice notes with zero network.

## Vercel: QR routes 404

- `/i/<id>`, `/l/<code>`, `/m/<id>` must serve `index.html` (rewrites in `vercel.json`). If 404: confirm `vercel.json` deployed at project root, framework preset Vite, then `vercel --prod`.
- `/assets/*` stale: immutable cache header is intentional — bump filename or redeploy on asset change.
