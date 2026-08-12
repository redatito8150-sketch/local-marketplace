-- set_brand_primary_owner(slug, null) (the "Unlink" button on the admin
-- brand edit page's "Brand Portal Access" widget) only ever clears
-- brands.owner_user_id — the *primary* owner convenience pointer — and the
-- brand_staff row belonging to whoever held that pointer. A brand can have
-- additional co-owners (brand_staff.access_level='owner' rows added via the
-- "add" mode on /admin/users, see 20260808000008_multiple_brand_owners.sql)
-- that this never touches: they keep full brand-portal access, their
-- profiles.role correctly stays 'brand_owner', and the edit-page widget
-- (previously fed only from owner_user_id) didn't even show they existed.
-- To an admin, that reads as "I clicked Unlink and nothing changed."
--
-- remove_brand_owner() lets the caller target one specific member instead,
-- so every owner (primary or co-owner) can actually be unlinked.
create or replace function public.remove_brand_owner(p_brand_slug text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand_id uuid;
  v_was_primary boolean;
begin
  select id, (owner_user_id = p_user_id) into v_brand_id, v_was_primary
  from public.brands where slug = p_brand_slug for update;
  if v_brand_id is null then
    raise exception using errcode = 'P0002', message = 'BRAND_NOT_FOUND';
  end if;

  delete from public.brand_staff
  where brand_id = v_brand_id and user_id = p_user_id and access_level = 'owner';

  if v_was_primary then
    update public.brands set owner_user_id = null where id = v_brand_id;
  end if;

  -- Same downgrade rule as set_brand_primary_owner: only drop back to
  -- 'customer' once this account holds no brand_staff row anywhere and is
  -- primary owner of nothing else, and never touch an admin/staff account's
  -- role.
  if not exists (select 1 from public.brand_staff where user_id = p_user_id)
     and not exists (select 1 from public.brands where owner_user_id = p_user_id) then
    update public.profiles
    set role = case when is_admin then role else 'customer' end
    where id = p_user_id;
  end if;

  return jsonb_build_object('brand_id', v_brand_id, 'removed_user_id', p_user_id, 'was_primary', v_was_primary);
end;
$$;

revoke all on function public.remove_brand_owner(text, uuid) from public, anon, authenticated;
grant execute on function public.remove_brand_owner(text, uuid) to service_role;
