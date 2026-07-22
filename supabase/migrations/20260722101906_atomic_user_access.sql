-- Change profile access and brand membership as one all-or-nothing operation.
create or replace function public.set_user_access(
  p_user_id uuid,
  p_access text,
  p_brand_slug text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_admin boolean;
begin
  if p_access not in (
    'customer', 'brand_owner', 'brand_assistant', 'staff', 'manager', 'admin'
  ) then
    raise exception 'Invalid access level';
  end if;

  if p_access in ('brand_owner', 'brand_assistant')
     and nullif(p_brand_slug, '') is null then
    raise exception 'A brand is required for this access level';
  end if;

  if p_access in ('brand_owner', 'brand_assistant')
     and not exists (select 1 from public.brands where slug = p_brand_slug) then
    raise exception 'Brand not found';
  end if;

  update public.brands
  set owner_user_id = null
  where owner_user_id = p_user_id
    and (p_access <> 'brand_owner' or slug <> p_brand_slug);

  if p_access = 'brand_owner' then
    update public.brands set owner_user_id = p_user_id where slug = p_brand_slug;
  end if;

  delete from public.brand_staff where user_id = p_user_id;
  if p_access = 'brand_assistant' then
    insert into public.brand_staff (brand_slug, user_id)
    values (p_brand_slug, p_user_id)
    on conflict (brand_slug, user_id) do nothing;
  end if;

  v_is_admin := p_access in ('staff', 'manager', 'admin');
  update public.profiles
  set is_admin = v_is_admin, role = p_access
  where id = p_user_id;

  if not found then raise exception 'User profile not found'; end if;
end;
$$;

revoke all on function public.set_user_access(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_user_access(uuid, text, text)
  to service_role;
