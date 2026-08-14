-- Repair the lifecycle edge case where a Draft has already acquired
-- immutable business history (for example, an inventory movement). Such a
-- row is no longer safe to hard-delete, but the original Archived transition
-- guard only allowed Published/Paused products to enter Archived. Admins get
-- one narrow, service-role-only escape hatch that preserves the row and its
-- audit history instead of deleting either.

create or replace function private.enforce_archived_product_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_admin_draft_repair boolean :=
    coalesce(current_setting('app.admin_archive_non_pristine_draft', true), '') = 'on';
begin
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'PRODUCT_ARCHIVED_IS_TERMINAL';
  end if;

  if old.status <> 'archived' and new.status = 'archived' then
    if old.status <> 'published'
       and not (old.status = 'draft' and v_admin_draft_repair) then
      raise exception 'PRODUCT_MUST_BE_PUBLISHED_BEFORE_ARCHIVE';
    end if;

    new.archived_at := coalesce(new.archived_at, now());
    new.paused_by_brand := false;
    new.deletion_requested_at := null;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_archived_product_transition()
  from public, anon, authenticated;

create or replace function public.admin_emergency_hide_product(
  p_product_id text,
  p_actor_id uuid,
  p_actor_label text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product record;
  v_eligibility jsonb;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'ARCHIVE_REASON_REQUIRED',
      'message', 'A reason is required to Archive this product.'
    );
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'PRODUCT_NOT_FOUND',
      'message', 'This product no longer exists.'
    );
  end if;

  perform id
  from public.product_variants
  where product_id = p_product_id
  for update;

  if v_product.status = 'archived' then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_ARCHIVED',
      'message', 'Product is already Archived.',
      'lifecycle', 'archived'
    );
  end if;

  if v_product.status = 'published' then
    return public.archive_product(
      p_product_id,
      null,
      p_actor_id,
      p_actor_label
    );
  end if;

  if v_product.status <> 'draft' then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_ARCHIVE_STATE',
      'message', 'Only a Published, Paused, or non-pristine Draft can be Archived.'
    );
  end if;

  v_eligibility := private.compute_product_deletion_eligibility(p_product_id);

  if coalesce((v_eligibility->>'canDeleteDraft')::boolean, false) then
    return jsonb_build_object(
      'ok', false,
      'code', 'DRAFT_IS_PRISTINE',
      'message', 'This Draft is pristine and can be permanently deleted instead.'
    );
  end if;

  perform set_config('app.admin_archive_non_pristine_draft', 'on', true);

  update public.products
  set status = 'archived',
      paused_by_brand = false,
      archived_at = now(),
      deletion_requested_at = null
  where id = p_product_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'NON_PRISTINE_DRAFT_ARCHIVED',
    'message', 'The non-pristine Draft was moved to Archived so its business history is preserved.',
    'lifecycle', 'archived',
    'before', to_jsonb(v_product),
    'eligibility', private.compute_product_deletion_eligibility(p_product_id)
  );
end;
$$;

revoke all on function public.admin_emergency_hide_product(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_emergency_hide_product(text, uuid, text, text)
  to service_role;

-- This exact row was created by the production migration smoke test. It has
-- 25 units and an immutable inventory movement, so deleting it would violate
-- the ledger's audit guarantees. Move it out of the active Draft queue while
-- retaining the evidence that made deletion unsafe.
do $$
begin
  if exists (
    select 1
    from public.products
    where id = 'migration-verify-product-e592656d'
      and name = 'Migration Verify Product'
      and status = 'draft'
  ) then
    perform public.admin_emergency_hide_product(
      'migration-verify-product-e592656d',
      null,
      'system migration',
      'Archive production migration verification data while preserving its immutable inventory ledger.'
    );
  end if;
end;
$$;
