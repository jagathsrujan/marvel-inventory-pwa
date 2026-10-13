# Marvel v1 inventory pwa

Pwa for Marvel makerspace inventory: capture, search, issue, return, dues, requests. One url serves student phone, volunteer phone, and desk.

## One-link setup (recommended)

Paste the repo link to any AI agent and say "set this up", or run it yourself:

- Agent entry point: `AGENTS.md` (copy-paste prompt + phase checklist).
- One command: `npm run setup` (`./scripts/agent-setup.sh`).
- The script wires YOUR accounts: GitHub + Supabase Cloud + Vercel live URL, picks an Ollama model for your admin machine, asks for your cloud LLM provider + docs URL + API key, then prints a readiness report.
- Manual fallback for any phase: `docs/SETUP-TROUBLESHOOTING.md`.

## Prereqs

- Node 20 or higher, npm 10 or higher (`engines` enforced).
- CLIs (checked by setup): `gh`, `supabase`, `vercel`, `ollama`, `curl`, `psql`.
- Supabase free project with url and anon key.
- One lab Android with Chrome for print station.
- Phomemo M220 with 40x30mm labels for trial.

## Env setup

- Canonical contract: `.env.example` (single source of truth).
- Copy template: `cp .env.example .env.local`.
- Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Fill `VITE_QR_BASE=https://marv.inv`.
- Optional: `VITE_OLLAMA_URL`, `VITE_OLLAMA_MODEL`, `VITE_LLM_PROVIDER`, `VITE_LLM_BASE_URL`, `VITE_LLM_API_KEY`, `VITE_LLM_MODEL`, `VITE_OCTOPART_KEY`.
- Validate: `npm run check-env` (add `--strict` to require LLM keys).
- Never commit `.env*`.

## Supabase setup (automated)

- `npm run setup` runs `supabase link` + `supabase db push` + `supabase/seed.sql` + `supabase/bootstrap-storage.sql`.
- Manual fallback: open Supabase dashboard, then Sql editor, run migrations in `supabase/migrations` in filename order, run seed in `supabase/seed.sql`, run `supabase/bootstrap-storage.sql`.
- Verify tables: category, item, location, stock lot, ledger, loan, member, project, course kit, request.
- Create storekeeper login under Authentication, then run `supabase/bootstrap-admin.sql` with their email + auth uuid.

## Run locally

- Install: `npm install`.
- Dev: `npm run dev`, then open `http://localhost:5173`.
- Build: `npm run build`.
- Preview build: `npm run preview`.
- Lint: `npm run lint`.

## Deploy on Vercel

- Push repo to GitHub.
- Import project in Vercel, framework preset Vite.
- Set env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_QR_BASE` (plus `VITE_LLM_*` if text cleanup is needed).
- Deploy. `vercel.json` handles Qr deep links `/i/:id`, `/l/:id`, `/m/:id` and caches `/assets/*` immutable.
- Test after deploy: open `/search`, open `/i/test-id`, reload offline queued page.

## Print station note

- Printing works only on one designated lab Android with Chrome over Bluetooth.
- iPhones are lookup and approve only, no M220 print.
- Keep printer paired to that one phone, keep one spare label roll at desk.
- Cover stickers with cello tape, thermal fades in heat in 3 to 4 months.

## Qr scheme

- Item lot: `https://marv.inv/i/<LOT_ID>`.
- Location: `https://marv.inv/l/<LOC_CODE>` printed big and laminated.
- Member: `https://marv.inv/m/<MEMBER_ID>` on back of Uvce id.

## Demo video script

1. Capture one Arduino Nano: scan shelf R1-S2-B3, photo pouch, marking, shelf, speak 10s, approve draft.
2. Print M220 sticker and stick on tag.
3. Issue Nano to student: scan item, scan member, pick 14d due, tap Issue.
4. Return Nano as damaged with photo, fine shows.
5. Open dues list, damaged return shows with history.
6. Open wa.me reminder from dues row.

## Trial and qa

- Trial protocol: `scripts/trial-30-items.md`.
- Trial log: `scripts/trial-log.csv`.
- Acceptance checklist: `docs/qa.md`.
- Timing budgets: `src/lib/perf.ts` with search 10s, issue 30s, return 30s.
