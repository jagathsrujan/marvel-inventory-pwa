-- MARVEL V1 admin bootstrap. Run AFTER the user signs up in Auth.
-- Replace <AUTH_UUID> with the user's auth.users id and the email with theirs.
-- Example: make Adrian (coordinator) the first admin.
insert into public.profiles (id, role, member_id)
values (
  '<AUTH_UUID>',
  'admin',
  (select id from public.members where college_email = 'adrian@uvce.edu')
)
on conflict (id) do update set role = excluded.role, member_id = excluded.member_id;
