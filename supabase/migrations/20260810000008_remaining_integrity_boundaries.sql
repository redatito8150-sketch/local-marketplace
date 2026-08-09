-- Stage 6: remove render-time data loss and close remaining integrity races.
-- This migration is intentionally additive/fail-closed. It never deletes products.

-- Expired drafts are archived by the authenticated daily maintenance job. Keeping
-- the row makes the action reversible and prevents a GET/RSC render from deleting
-- a merchant's work.
create or replace function public.archive_expired_product_drafts(
  p_cutoff timestamptz,
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with candidates as (
    select id
    from public.products
    where status = 'draft'
      and draft_started_at is not null
      and draft_started_at < p_cutoff
    order by draft_started_at
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
    for update skip locked
  ), archived as (
    update public.products p
    set status = 'archived', updated_at = now()
    from candidates c
    where p.id = c.id
    returning p.id
  )
  select count(*) into v_count from archived;
  return v_count;
end;
$$;

revoke all on function public.archive_expired_product_drafts(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.archive_expired_product_drafts(timestamptz, integer) to service_role;

-- Validate the target before clearing the current default. The advisory lock and
-- partial unique index make concurrent swaps deterministic.
with ranked as (
  select id, row_number() over (partition by user_id order by updated_at desc, created_at desc, id) as position
  from public.addresses
  where is_default
)
update public.addresses a
set is_default = false, updated_at = now()
from ranked r
where a.id = r.id and r.position > 1;

create unique index if not exists addresses_one_default_per_user_idx
  on public.addresses (user_id) where is_default;

create or replace function public.set_default_address(p_user_id uuid, p_address_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if not exists (
    select 1 from public.addresses where id = p_address_id and user_id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'ADDRESS_NOT_FOUND_OR_FORBIDDEN';
  end if;

  update public.addresses
  set is_default = (id = p_address_id), updated_at = now()
  where user_id = p_user_id and (is_default or id = p_address_id);
end;
$$;

revoke all on function public.set_default_address(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_default_address(uuid, uuid) to service_role;

-- OTP verification, attempt counting, consumption and profile promotion happen
-- under one row lock and transaction. Parallel guesses cannot reuse an attempts
-- value or consume a code twice.
create or replace function public.verify_phone_otp(
  p_user_id uuid,
  p_otp_hash text,
  p_max_attempts integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verification public.phone_verifications%rowtype;
  v_now timestamptz := now();
begin
  select * into v_verification
  from public.phone_verifications
  where user_id = p_user_id and consumed_at is null
  order by created_at desc
  limit 1
  for update;

  if not found then return jsonb_build_object('status', 'missing'); end if;
  if v_verification.expires_at <= v_now then return jsonb_build_object('status', 'expired'); end if;
  if v_verification.attempts >= p_max_attempts then return jsonb_build_object('status', 'locked'); end if;

  if v_verification.otp_hash <> p_otp_hash then
    update public.phone_verifications
    set attempts = attempts + 1
    where id = v_verification.id;
    return jsonb_build_object(
      'status', case when v_verification.attempts + 1 >= p_max_attempts then 'locked' else 'incorrect' end,
      'attempts', v_verification.attempts + 1
    );
  end if;

  update public.phone_verifications set consumed_at = v_now where id = v_verification.id;
  update public.profiles
  set phone = v_verification.phone, phone_verified_at = v_now
  where id = p_user_id;
  return jsonb_build_object('status', 'verified', 'phone', v_verification.phone);
end;
$$;

revoke all on function public.verify_phone_otp(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.verify_phone_otp(uuid, text, integer) to service_role;

-- Serialize the three-option limit per product to close count-then-insert races.
create or replace function public.enforce_max_3_product_options()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.product_id::text, 0));
  if (select count(*) from public.product_options where product_id = new.product_id) >= 3 then
    raise exception 'A product can have a maximum of 3 variant options.';
  end if;
  return new;
end;
$$;

-- A variant may only use values explicitly selected for its own product.
create or replace function public.enforce_variant_value_belongs_to_product()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_product_id text;
begin
  select product_id into v_product_id from public.product_variants where id = new.variant_id;
  if v_product_id is null or not exists (
    select 1
    from public.product_option_values pov
    join public.product_options po on po.id = pov.product_option_id
    where po.product_id = v_product_id and pov.option_value_id = new.option_value_id
  ) then
    raise exception 'Variant option value is not selected for this product.';
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_enforce_variant_value_belongs_to_product on public.product_variant_values;
create trigger trigger_enforce_variant_value_belongs_to_product
  before insert or update on public.product_variant_values
  for each row execute function public.enforce_variant_value_belongs_to_product();

-- Color images must reference a Color value selected for this exact product.
create or replace function public.enforce_color_image_is_color_option()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.product_option_values pov
    join public.product_options po on po.id = pov.product_option_id
    join public.option_values ov on ov.id = pov.option_value_id
    join public.option_types ot on ot.id = ov.option_type_id
    where po.product_id = new.product_id
      and pov.option_value_id = new.option_value_id
      and ot.key = 'color'
  ) then
    raise exception 'Color image option value is not selected for this product.';
  end if;
  return new;
end;
$$;

-- Explicit grants are repeated after replacement so future default privileges
-- cannot accidentally expose these service routines.
revoke all on function public.enforce_max_3_product_options() from public, anon, authenticated;
revoke all on function public.enforce_variant_value_belongs_to_product() from public, anon, authenticated;
revoke all on function public.enforce_color_image_is_color_option() from public, anon, authenticated;

-- Keep the legacy primary-owner pointer, authoritative membership row and
-- profile tier consistent in one transaction. This replaces the admin route's
-- previous sequence of unrelated updates and cleans up the displaced owner.
create or replace function public.set_brand_primary_owner(p_brand_slug text, p_new_owner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand_id uuid;
  v_old_owner_id uuid;
begin
  select id, owner_user_id into v_brand_id, v_old_owner_id
  from public.brands where slug = p_brand_slug for update;
  if v_brand_id is null then raise exception using errcode = 'P0002', message = 'BRAND_NOT_FOUND'; end if;

  if p_new_owner_id is not null and not exists (select 1 from public.profiles where id = p_new_owner_id) then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;

  if v_old_owner_id is not null and v_old_owner_id is distinct from p_new_owner_id then
    delete from public.brand_staff
    where brand_id = v_brand_id and user_id = v_old_owner_id and access_level = 'owner';
  end if;

  update public.brands set owner_user_id = p_new_owner_id where id = v_brand_id;
  if p_new_owner_id is not null then
    insert into public.brand_staff (brand_id, user_id, access_level)
    values (v_brand_id, p_new_owner_id, 'owner')
    on conflict (brand_id, user_id) do update set access_level = 'owner';
    update public.profiles
    set role = case when is_admin then role else 'brand_owner' end
    where id = p_new_owner_id;
  end if;

  if v_old_owner_id is not null and v_old_owner_id is distinct from p_new_owner_id
     and not exists (select 1 from public.brand_staff where user_id = v_old_owner_id)
     and not exists (select 1 from public.brands where owner_user_id = v_old_owner_id) then
    update public.profiles
    set role = case when is_admin then role else 'customer' end
    where id = v_old_owner_id;
  end if;

  return jsonb_build_object('old_owner_id', v_old_owner_id, 'new_owner_id', p_new_owner_id);
end;
$$;

revoke all on function public.set_brand_primary_owner(text, uuid) from public, anon, authenticated;
grant execute on function public.set_brand_primary_owner(text, uuid) to service_role;
