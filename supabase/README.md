Automated: run `npm run setup` from repo root (see `AGENTS.md`). Manual fallback:

1. Open Supabase dashboard -> SQL Editor -> New query.
2. Paste supabase/migrations/0001_marvel_v1.sql, Run (creates 11 tables + RLS + buckets).
3. Paste supabase/seed.sql, Run (10 cats, 7 locs, 13 items+lots, 5 members, 1 project/kit/request).
4. If buckets are missing: paste supabase/bootstrap-storage.sql, Run.
5. Auth -> Users -> add logins, then edit + run supabase/bootstrap-admin.sql (id = auth id, role, member_id).
6. Storage -> confirm item-photos, shelf-photos, condition-photos are public.
