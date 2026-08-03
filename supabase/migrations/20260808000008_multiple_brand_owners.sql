-- Brands could only ever have exactly one owner (brands.owner_user_id, a
-- single column with its own unique index) — assigning a second person as
-- "Brand Owner" of an already-owned brand silently displaced the first one
-- (their profiles.role stayed 'brand_owner', but no brand pointed to them
-- anymore) with zero warning. This makes multiple co-equal owners a real,
-- supported thing, using the same brand_staff junction table assistants
-- already use — access_level distinguishes the two, both get identical
-- brand-portal permissions (requireBrandOwner() in
-- lib/supabase/brandAuth.ts already only checks accessLevel === "owner",
-- regardless of which mechanism produced it).
alter table brand_staff add column if not exists access_level text not null default 'assistant'
  check (access_level in ('owner', 'assistant'));

-- Every brand's existing single owner also becomes a real brand_staff row
-- at access_level='owner' — so from here on, brand_staff is the complete,
-- authoritative membership list (owner *and* assistant), and
-- brands.owner_user_id is kept only as a "primary owner" convenience
-- pointer for the handful of RLS policies/legacy code that still read it
-- directly, not as the sole source of truth.
insert into brand_staff (brand_id, user_id, access_level)
select b.id, b.owner_user_id, 'owner'
from brands b
where b.owner_user_id is not null
on conflict (brand_id, user_id) do update set access_level = 'owner';

-- Postgres identifies functions by name *and* parameter signature — adding
-- a 4th parameter (even with a default) creates a distinct overload
-- alongside the old 3-arg one rather than replacing it, and a 3-arg call
-- would then be ambiguous between the two. Drop the old signature outright.
drop function if exists public.set_user_access(uuid, text, text);

-- set_user_access() gains p_mode: 'replace' (default, previous behavior —
-- this user becomes the brand's *only* owner, every existing owner loses
-- the link) or 'add' (this user becomes an *additional* co-equal owner,
-- every existing owner is left completely untouched). The admin UI
-- (components/admin/UserAccessControl.tsx) now checks for an existing
-- owner first and asks before ever calling this in 'replace' mode.
create or replace function public.set_user_access(
  p_user_id uuid,
  p_access text,
  p_brand_slug text default null,
  p_mode text default 'replace'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_admin boolean;
  v_brand_id uuid;
begin
  if p_access not in ('customer', 'brand_owner', 'brand_assistant', 'staff', 'manager', 'admin') then
    raise exception 'Invalid access level';
  end if;
  if p_mode not in ('replace', 'add') then
    raise exception 'Invalid mode';
  end if;
  if p_access in ('brand_owner', 'brand_assistant') and nullif(p_brand_slug, '') is null then
    raise exception 'A brand is required for this access level';
  end if;
  if p_access in ('brand_owner', 'brand_assistant') then
    select id into v_brand_id from public.brands where slug = p_brand_slug;
    if v_brand_id is null then
      raise exception 'Brand not found';
    end if;
  end if;

  if p_mode = 'add' and p_access = 'brand_owner' then
    -- Co-owner path: every *other* owner of this brand (owner_user_id
    -- column and any other brand_staff access_level='owner' rows) is left
    -- completely untouched. This user is only ever removed from brands
    -- *other* than this one (so they don't stay listed as sole owner of
    -- some unrelated brand from before), and only claims the owner_user_id
    -- column itself if nobody already holds it for this brand.
    update public.brands set owner_user_id = null
    where owner_user_id = p_user_id and slug <> p_brand_slug;
    update public.brands set owner_user_id = p_user_id
    where slug = p_brand_slug and owner_user_id is null;
    delete from public.brand_staff where user_id = p_user_id and brand_id <> v_brand_id;
    insert into public.brand_staff (brand_id, user_id, access_level)
    values (v_brand_id, p_user_id, 'owner')
    on conflict (brand_id, user_id) do update set access_level = 'owner';
  else
    -- Replace mode (default) — this user becomes the brand's *only* owner;
    -- every previous owner (column *and* any brand_staff owner rows) loses
    -- the link, matching the original single-owner behavior exactly.
    update public.brands set owner_user_id = null
    where owner_user_id = p_user_id
      and (p_access <> 'brand_owner' or slug <> p_brand_slug);
    if p_access = 'brand_owner' then
      update public.brands set owner_user_id = p_user_id where slug = p_brand_slug;
      delete from public.brand_staff where brand_id = v_brand_id and access_level = 'owner';
    end if;

    delete from public.brand_staff where user_id = p_user_id;
    if p_access = 'brand_assistant' then
      insert into public.brand_staff (brand_id, user_id, access_level)
      values (v_brand_id, p_user_id, 'assistant')
      on conflict (brand_id, user_id) do update set access_level = 'assistant';
    end if;
    if p_access = 'brand_owner' then
      insert into public.brand_staff (brand_id, user_id, access_level)
      values (v_brand_id, p_user_id, 'owner')
      on conflict (brand_id, user_id) do update set access_level = 'owner';
    end if;
  end if;

  v_is_admin := p_access in ('staff', 'manager', 'admin');
  update public.profiles set is_admin = v_is_admin, role = p_access where id = p_user_id;
  if not found then raise exception 'User profile not found'; end if;
end;
$$;

revoke all on function public.set_user_access(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_user_access(uuid, text, text, text) to service_role;
