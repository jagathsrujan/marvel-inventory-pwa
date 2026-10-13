1. Open Supabase dashboard -> SQL Editor -> New query.
2. Paste supabase/migrations/0001_marvel_v1.sql, Run (creates 11 tables + RLS + buckets).
3. Paste supabase/seed.sql, Run (10 cats, 7 locs, 13 items+lots, 5 members, 1 project/kit/request).
4. Auth -> Users -> add logins, then insert profiles rows (id=auth id, role, member_id).
5. Storage -> confirm item-photos, shelf-photos, condition-photos are public.
