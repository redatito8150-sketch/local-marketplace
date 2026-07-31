-- Role hierarchy (Discord-style rank) + unifies the custom roles system
-- with the legacy profiles.role/is_admin floor that ~40 existing admin
-- routes still check via requireStaffRole(). Previously the two systems
-- were disconnected: removing someone's custom role never touched
-- profiles.role, so a legacy role='admin' account kept full access via
-- getUserPermissions()'s grandfather clause regardless of what the roles
-- table said. From this migration on, profiles.is_admin/profiles.role
-- become a *derived* value, recomputed by assign_user_role/
-- unassign_user_role every time someone's role set actually changes —
-- never written directly by the UI for staff-tier accounts anymore.

alter table public.roles add column if not exists rank integer not null default 1;

update public.roles set rank = 100 where name = 'Admin';
update public.roles set rank = 50 where name = 'Manager';
update public.roles set rank = 10 where name = 'Staff';

-- ── Shared tier-derivation logic ─────────────────────────────────────────
-- Reused by assign_user_role, unassign_user_role, and the role-delete API
-- route (which calls this directly for every user affected by a cascade
-- delete of a role's user_roles rows). Deliberately has no actor/
-- permission checks of its own — it's a pure "recompute the derived
-- value from current state" step, not a gated action.
create or replace function public.recompute_profile_tier(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max_rank integer;
  v_tier text;
begin
  select max(r.rank) into v_max_rank
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_user_id;

  if v_max_rank is not null and v_max_rank > 0 then
    v_tier := case
      when v_max_rank >= 100 then 'admin'
      when v_max_rank >= 50 then 'manager'
      else 'staff'
    end;
    update public.profiles set is_admin = true, role = v_tier where id = p_user_id;
    return;
  end if;

  -- Holding zero roles always means zero internal-team access — no
  -- partial step-down — unless the account is genuinely a brand owner or
  -- brand staff member (an unrelated mechanism), in which case that link
  -- is preserved rather than silently severed.
  if exists (select 1 from public.brands where owner_user_id = p_user_id) then
    update public.profiles set is_admin = false, role = 'brand_owner' where id = p_user_id;
  elsif exists (select 1 from public.brand_staff where user_id = p_user_id) then
    update public.profiles set is_admin = false, role = 'brand_assistant' where id = p_user_id;
  else
    update public.profiles set is_admin = false, role = 'customer' where id = p_user_id;
  end if;
end;
$$;

revoke all on function public.recompute_profile_tier(uuid) from public, anon, authenticated;
grant execute on function public.recompute_profile_tier(uuid) to service_role;

-- ── Rank-checked assign/unassign ─────────────────────────────────────────
-- Re-validates permission + hierarchy server-side (defense in depth —
-- the API layer checks the same rules, but this is the actual trust
-- boundary, matching every other privileged RPC in this project):
--   - actor must be_admin and hold manage_roles (via a real role, or the
--     legacy role='admin' grandfather)
--   - actor can never touch their own role assignment, at all
--   - the role being granted/revoked must rank below the actor's own
--     highest rank
--   - the target account's current highest rank must also be below the
--     actor's own highest rank (mirrors real Discord: you can't touch an
--     account that outranks or matches you, even to add a low role)
-- A legacy role='admin'/'manager'/'staff' account without a matching
-- user_roles row yet (shouldn't happen post-backfill, kept as a
-- defensive floor) is treated as holding at least that tier's rank.
create or replace function public.assign_user_role(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_role_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_is_admin boolean;
  v_actor_legacy_role text;
  v_actor_max_rank integer;
  v_has_manage_roles boolean;
  v_role_rank integer;
  v_target_legacy_role text;
  v_target_max_rank integer;
begin
  if p_actor_id = p_target_user_id then
    raise exception 'You cannot modify your own role assignment';
  end if;

  select is_admin, role into v_actor_is_admin, v_actor_legacy_role
  from public.profiles where id = p_actor_id;
  if not coalesce(v_actor_is_admin, false) then
    raise exception 'Not authorized';
  end if;

  if v_actor_legacy_role = 'admin' then
    v_has_manage_roles := true;
  else
    select exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = p_actor_id and rp.permission_key = 'manage_roles'
    ) into v_has_manage_roles;
  end if;
  if not v_has_manage_roles then
    raise exception 'Not authorized';
  end if;

  select coalesce(max(r.rank), 0) into v_actor_max_rank
  from public.user_roles ur join public.roles r on r.id = ur.role_id
  where ur.user_id = p_actor_id;
  v_actor_max_rank := greatest(
    v_actor_max_rank,
    case v_actor_legacy_role when 'admin' then 100 when 'manager' then 50 when 'staff' then 10 else 0 end
  );

  select rank into v_role_rank from public.roles where id = p_role_id;
  if not found then
    raise exception 'Role not found';
  end if;
  if v_role_rank >= v_actor_max_rank then
    raise exception 'You cannot grant a role at or above your own rank';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'Target user not found';
  end if;

  select coalesce(max(r.rank), 0) into v_target_max_rank
  from public.user_roles ur join public.roles r on r.id = ur.role_id
  where ur.user_id = p_target_user_id;
  select role into v_target_legacy_role from public.profiles where id = p_target_user_id;
  v_target_max_rank := greatest(
    v_target_max_rank,
    case v_target_legacy_role when 'admin' then 100 when 'manager' then 50 when 'staff' then 10 else 0 end
  );
  if v_target_max_rank >= v_actor_max_rank then
    raise exception 'You cannot manage this account — it is at or above your own rank';
  end if;

  insert into public.user_roles (user_id, role_id, assigned_by)
  values (p_target_user_id, p_role_id, p_actor_id)
  on conflict (user_id, role_id) do nothing;

  perform public.recompute_profile_tier(p_target_user_id);
end;
$$;

create or replace function public.unassign_user_role(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_role_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_is_admin boolean;
  v_actor_legacy_role text;
  v_actor_max_rank integer;
  v_has_manage_roles boolean;
  v_role_rank integer;
  v_target_legacy_role text;
  v_target_max_rank integer;
begin
  if p_actor_id = p_target_user_id then
    raise exception 'You cannot modify your own role assignment';
  end if;

  select is_admin, role into v_actor_is_admin, v_actor_legacy_role
  from public.profiles where id = p_actor_id;
  if not coalesce(v_actor_is_admin, false) then
    raise exception 'Not authorized';
  end if;

  if v_actor_legacy_role = 'admin' then
    v_has_manage_roles := true;
  else
    select exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = p_actor_id and rp.permission_key = 'manage_roles'
    ) into v_has_manage_roles;
  end if;
  if not v_has_manage_roles then
    raise exception 'Not authorized';
  end if;

  select coalesce(max(r.rank), 0) into v_actor_max_rank
  from public.user_roles ur join public.roles r on r.id = ur.role_id
  where ur.user_id = p_actor_id;
  v_actor_max_rank := greatest(
    v_actor_max_rank,
    case v_actor_legacy_role when 'admin' then 100 when 'manager' then 50 when 'staff' then 10 else 0 end
  );

  select rank into v_role_rank from public.roles where id = p_role_id;
  if not found then
    raise exception 'Role not found';
  end if;
  if v_role_rank >= v_actor_max_rank then
    raise exception 'You cannot manage a role at or above your own rank';
  end if;

  select coalesce(max(r.rank), 0) into v_target_max_rank
  from public.user_roles ur join public.roles r on r.id = ur.role_id
  where ur.user_id = p_target_user_id;
  select role into v_target_legacy_role from public.profiles where id = p_target_user_id;
  v_target_max_rank := greatest(
    v_target_max_rank,
    case v_target_legacy_role when 'admin' then 100 when 'manager' then 50 when 'staff' then 10 else 0 end
  );
  if v_target_max_rank >= v_actor_max_rank then
    raise exception 'You cannot manage this account — it is at or above your own rank';
  end if;

  delete from public.user_roles where user_id = p_target_user_id and role_id = p_role_id;

  perform public.recompute_profile_tier(p_target_user_id);
end;
$$;

revoke all on function public.assign_user_role(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_user_role(uuid, uuid, uuid) to service_role;
revoke all on function public.unassign_user_role(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.unassign_user_role(uuid, uuid, uuid) to service_role;
