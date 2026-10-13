# Marvel v1 inventory pwa

Pwa for Marvel makerspace inventory: capture, search, issue, return, dues, requests. One url serves student phone, volunteer phone, and desk.

## Prereqs

- Node 20 or higher, npm 10 or higher.
- Supabase free project with url and anon key.
- One lab Android with Chrome for print station.
- Phomemo M220 with 40x30mm labels for trial.

## Env setup

- Copy env template: `cp .env.example .env`.
- Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Fill `VITE_APP_QR_BASE=https://marv.inv`.
- Never commit `.env`.

## Supabase setup

- Open Supabase dashboard, then Sql editor.
- Run migrations in `supabase/migrations` in filename order.
- Run seed in `supabase/seed.sql` for Marvel catalogue.
- Verify tables: category, item, location, stock lot, ledger, loan, member, project, course kit, request.
- Create storekeeper login under Authentication, then set role in member table.

## Run locally

- Install: `npm install`.
- Dev: `npm run dev`, then open `http://localhost:5173`.
- Build: `npm run build`.
- Preview build: `npm run preview`.
- Lint: `npm run lint`.

## Deploy on Vercel

- Push repo to GitHub.
- Import project in Vercel, framework preset Vite.
- Set env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_QR_BASE`.
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
