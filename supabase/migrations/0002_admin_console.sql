-- MARVEL admin console (0002): soft-kick flag + deactivated-member guards.
-- Run AFTER 0001_marvel_v1.sql in Supabase SQL Editor.

alter table public.members
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz;

create index if not exists members_active_idx on public.members (is_active);

-- Helper: the member row linked to the current auth user.
create or replace function public.my_member_id()
returns uuid language sql security definer set search_path = public as
$$ select member_id from public.profiles where id = auth.uid() $$;

-- Helper: is the caller's linked member active? Staff bypass (they act on behalf).
create or replace function public.caller_is_active()
returns boolean language sql security definer set search_path = public as
$$
  select case
    when public.my_role() in ('admin', 'storekeeper') then true
    when public.my_member_id() is null then true
    else coalesce((select is_active from public.members where id = public.my_member_id()), true)
  end
$$;

-- Deactivated members cannot create requests or receive new loans.
drop policy if exists req_member_insert on public.requests;
create policy req_member_insert on public.requests for insert to authenticated
  with check (
    member_id = public.my_member_id()
    and public.caller_is_active()
  );

drop policy if exists req_staff_all on public.requests;
create policy req_staff_all on public.requests for all to authenticated
  using (public.my_role() in ('admin', 'storekeeper'))
  with check (public.my_role() in ('admin', 'storekeeper'));

-- Staff-issued loans still allowed (returns/renewals), but guard direct
-- member-path inserts via the same active check on loans insert for members.
-- Staff policy stays permissive; members have no loan-insert policy, so no
-- change needed there — deactivation bites at request + app level.
