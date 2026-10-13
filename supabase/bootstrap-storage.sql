-- MARVEL V1 storage bootstrap. Migration 0001 already creates these buckets;
-- run this if buckets are missing (fresh project, partial apply).
insert into storage.buckets (id, name, public) values
  ('item-photos', 'item-photos', true),
  ('shelf-photos', 'shelf-photos', true),
  ('condition-photos', 'condition-photos', true)
on conflict (id) do update set public = excluded.public;
