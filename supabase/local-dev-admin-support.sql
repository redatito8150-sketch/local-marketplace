-- LOCAL DEVELOPMENT ONLY.
-- Applied last by scripts/local-supabase.mjs and never copied to production.
-- The local service key can call this narrow security-definer boundary without
-- reopening direct writes to protected account/role tables.

create or replace function public.prepare_local_dev_admin(p_user_id uuid)
returns table (
  is_admin boolean,
  profile_role text,
  onboarding_completed_at timestamptz,
  role_assigned boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_role_id uuid;
begin
  update public.profiles
  set full_name = 'Admin',
      email = 'admin@local.test',
      is_admin = true,
      role = 'admin',
      onboarding_completed_at = coalesce(profiles.onboarding_completed_at, now())
  where id = p_user_id;

  if not found then
    raise exception 'Local Admin profile was not created by the Auth trigger';
  end if;

  select id into v_admin_role_id
  from public.roles
  where name = 'Admin';

  if v_admin_role_id is null then
    raise exception 'Built-in Admin role is unavailable';
  end if;

  insert into public.user_roles (user_id, role_id)
  values (p_user_id, v_admin_role_id)
  on conflict (user_id, role_id) do nothing;

  return query
  select p.is_admin,
         p.role,
         p.onboarding_completed_at,
         exists (
           select 1
           from public.user_roles ur
           where ur.user_id = p_user_id and ur.role_id = v_admin_role_id
         )
  from public.profiles p
  where p.id = p_user_id;
end;
$$;

revoke all on function public.prepare_local_dev_admin(uuid) from public, anon, authenticated;
grant execute on function public.prepare_local_dev_admin(uuid) to service_role;
