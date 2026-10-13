-- MARVEL V1 migration (Supabase / Postgres).
-- Contract: shared/types.ts (categories, items, locations, stock_lots,
-- ledger, loans, members, projects, course_kits, requests) + profiles for RLS.
-- Roles: admin full, storekeeper read/write stock+loans, member read own + request.

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ tables
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code3 text not null unique check (code3 in ('PAS','ACT','DIO','MOD','BRD','WIR','HTL','PTL','MEA','MAC')),
  parent_id uuid references public.categories (id) on delete set null,
  icon text not null default ''
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  parent_id uuid references public.locations (id) on delete set null,
  type text not null check (type in ('Lab','Rack','Shelf','Bin')),
  photo_url text,
  path text not null
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  card_qr text not null unique,
  name text not null,
  college_email text not null unique,
  phone text not null default '',
  course_year text not null default '',
  track text not null check (track in ('student','project','competition','research','equipment_support')),
  dues_count integer not null default 0 check (dues_count >= 0)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  track text not null check (track in ('student','project','competition','research','equipment_support')),
  member_ids uuid[] not null default '{}',
  coordinator_id uuid not null references public.members (id) on delete restrict,
  budget_cap numeric not null default 0,
  status text not null check (status in ('proposed','active','done'))
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category_id uuid references public.categories (id) on delete set null,
  specs jsonb not null default '{}'::jsonb,
  uom text not null default 'pcs',
  min_qty integer not null default 0,
  max_qty integer not null default 0,
  photo_urls text[] not null default '{}',
  datasheet_url text,
  supplier text,
  last_rate numeric,
  type text not null check (type in ('consumable','returnable','asset')),
  unit_weight_g numeric,
  replacement_cost numeric not null default 0
);

create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete restrict,
  home_location_id uuid not null references public.locations (id) on delete restrict,
  qty integer not null default 0 check (qty >= 0),
  batch text
);

create table public.ledger (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.stock_lots (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  action text not null check (action in ('created','add','remove','move','count','issue','return','adjust')),
  delta_qty integer not null default 0,
  from_loc text,
  to_loc text,
  by_user text not null,
  note text not null check (char_length(note) > 0),
  photo_url text,
  ts timestamptz not null default now()
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.stock_lots (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  qty integer not null default 1 check (qty > 0),
  member_id uuid not null references public.members (id) on delete restrict,
  project_id uuid references public.projects (id) on delete set null,
  issued_by text not null,
  issued_at timestamptz not null default now(),
  due_at timestamptz not null,
  returned_at timestamptz,
  condition_in text not null default 'Good' check (condition_in in ('Good','Damaged','Dead')),
  condition_out text check (condition_out in ('Good','Damaged','Dead')),
  fine numeric not null default 0,
  status text not null default 'open' check (status in ('open','returned','overdue','lost'))
);

create table public.course_kits (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  requires_supervision boolean not null default false
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','issued','returned','rejected')),
  due_at timestamptz not null,
  decided_by text
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin','storekeeper','member')),
  member_id uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ indexes
create index items_sku_idx on public.items (sku);
create index lots_item_idx on public.stock_lots (item_id);
create index lots_location_idx on public.stock_lots (location_id);
create index ledger_lot_idx on public.ledger (lot_id);
create index ledger_item_ts_idx on public.ledger (item_id, ts desc);
create index loans_member_idx on public.loans (member_id);
create index loans_status_idx on public.loans (status);
create index loans_due_idx on public.loans (due_at);
create index requests_status_idx on public.requests (status);
create index requests_member_idx on public.requests (member_id);
create index locations_code_idx on public.locations (code);
create index members_card_idx on public.members (card_qr);

-- ------------------------------------------------------------------ RLS
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.locations enable row level security;
alter table public.stock_lots enable row level security;
alter table public.ledger enable row level security;
alter table public.loans enable row level security;
alter table public.members enable row level security;
alter table public.projects enable row level security;
alter table public.course_kits enable row level security;
alter table public.requests enable row level security;
alter table public.profiles enable row level security;

-- Security-definer role lookup (bypasses RLS, avoids recursion).
create or replace function public.my_role()
returns text language sql security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

-- Catalog: any authenticated user can read (search <10s for all roles).
create policy cat_read on public.categories for select to authenticated using (true);
create policy items_read on public.items for select to authenticated using (true);
create policy loc_read on public.locations for select to authenticated using (true);
create policy lots_read on public.stock_lots for select to authenticated using (true);
create policy ledger_read on public.ledger for select to authenticated using (true);
create policy members_self_read on public.members for select to authenticated
  using (id = (select member_id from public.profiles where id = auth.uid()));
create policy projects_read on public.projects for select to authenticated using (true);
create policy kits_read on public.course_kits for select to authenticated using (true);

-- Catalog writes: admin full; storekeeper read/write stock (+ members/projects/kits).
create policy cat_admin_write on public.categories for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy items_write on public.items for all to authenticated
  using (public.my_role() in ('admin','storekeeper')) with check (public.my_role() in ('admin','storekeeper'));
create policy loc_write on public.locations for all to authenticated
  using (public.my_role() in ('admin','storekeeper')) with check (public.my_role() in ('admin','storekeeper'));
create policy lots_write on public.stock_lots for all to authenticated
  using (public.my_role() in ('admin','storekeeper')) with check (public.my_role() in ('admin','storekeeper'));
create policy ledger_write on public.ledger for all to authenticated
  using (public.my_role() in ('admin','storekeeper')) with check (public.my_role() in ('admin','storekeeper'));
create policy members_staff_all on public.members for all to authenticated
  using (public.my_role() in ('admin','storekeeper')) with check (public.my_role() in ('admin','storekeeper'));
create policy projects_write on public.projects for all to authenticated
  using (public.my_role() in ('admin','storekeeper')) with check (public.my_role() in ('admin','storekeeper'));
create policy kits_write on public.course_kits for all to authenticated
  using (public.my_role() in ('admin','storekeeper')) with check (public.my_role() in ('admin','storekeeper'));

-- Loans: admin/storekeeper full; members read own only.
create policy loans_staff_all on public.loans for all to authenticated
  using (public.my_role() in ('admin','storekeeper')) with check (public.my_role() in ('admin','storekeeper'));
create policy loans_member_read on public.loans for select to authenticated
  using (member_id = (select member_id from public.profiles where id = auth.uid()));

-- Requests: admin/storekeeper full; members read own + create own.
create policy req_staff_all on public.requests for all to authenticated
  using (public.my_role() in ('admin','storekeeper')) with check (public.my_role() in ('admin','storekeeper'));
create policy req_member_read on public.requests for select to authenticated
  using (member_id = (select member_id from public.profiles where id = auth.uid()));
create policy req_member_insert on public.requests for insert to authenticated
  with check (member_id = (select member_id from public.profiles where id = auth.uid()));

-- Profiles: readable by authenticated (client role checks); self-insert on signup; admin updates.
create policy prof_read on public.profiles for select to authenticated using (true);
create policy prof_insert_own on public.profiles for insert to authenticated with check (id = auth.uid());
create policy prof_admin_update on public.profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy prof_admin_delete on public.profiles for delete to authenticated using (public.my_role() = 'admin');

-- ------------------------------------------------------------------ storage
insert into storage.buckets (id, name, public) values
  ('item-photos','item-photos', true),
  ('shelf-photos','shelf-photos', true),
  ('condition-photos','condition-photos', true)
on conflict (id) do update set public = excluded.public;

create policy photos_public_read on storage.objects for select to public
  using (bucket_id in ('item-photos','shelf-photos','condition-photos'));
create policy photos_auth_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('item-photos','shelf-photos','condition-photos'));
create policy photos_staff_update on storage.objects for update to authenticated
  using (public.my_role() in ('admin','storekeeper'));
create policy photos_admin_delete on storage.objects for delete to authenticated
  using (public.my_role() = 'admin');

-- ------------------------------------------------------------------ grants
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
