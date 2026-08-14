-- ============================================================================
-- Final product lifecycle
--
-- Draft -> Published -> Paused/Resumed -> Archived -> eligibility check
--
-- A pristine Draft can be deleted immediately. Archived is irreversible:
-- products with immutable business history remain Archived, temporary blockers
-- are reported with an explicit resolution, and a history-free/blocker-free
-- Archived product can be permanently deleted after a typed confirmation in
-- the application. There are no deletion requests, approvals, schedules,
-- countdowns, or product-deletion cron jobs.
-- ============================================================================

create extension if not exists pg_trgm;

alter table public.products add column if not exists archived_at timestamptz;
update public.products
set archived_at = coalesce(archived_at, created_at)
where status = 'archived' and archived_at is null;

comment on column public.products.deletion_requested_at is
  'Legacy display field. The final Archived lifecycle has no deletion request or schedule.';

-- Immutable history for products that were actually hard-deleted.
create table if not exists public.product_deletion_history (
  id uuid primary key default gen_random_uuid(),
  product_id_snapshot text not null,
  product_name_snapshot text not null,
  product_sku_snapshot text,
  product_image_snapshot text,
  brand_id uuid not null references public.brands(id) on delete restrict,
  deleted_from text not null check (deleted_from in ('draft', 'archived')),
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_by_label text not null,
  reason text,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  media_jobs_queued integer not null default 0,
  operation_key text not null,
  deleted_at timestamptz not null default now(),
  unique (product_id_snapshot, operation_key)
);

create index if not exists product_deletion_history_brand_deleted_idx
  on public.product_deletion_history (brand_id, deleted_at desc);
create index if not exists product_deletion_history_name_trgm_idx
  on public.product_deletion_history using gin (product_name_snapshot gin_trgm_ops);
alter table public.product_deletion_history enable row level security;
revoke all on public.product_deletion_history from public, anon, authenticated;
grant select, insert, delete on public.product_deletion_history to service_role;

-- Legal/admin holds remain an operational blocker, not a lifecycle state.
create table if not exists public.product_deletion_holds (
  id uuid primary key default gen_random_uuid(),
  product_id text references public.products(id) on delete set null,
  product_id_snapshot text not null,
  product_name_snapshot text not null,
  brand_id uuid not null references public.brands(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'released')),
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_by_label text not null,
  created_at timestamptz not null default now(),
  released_by uuid references auth.users(id) on delete set null,
  released_by_label text,
  released_at timestamptz
);

create unique index if not exists product_deletion_holds_one_active_idx
  on public.product_deletion_holds (product_id)
  where product_id is not null and status = 'active';
create index if not exists product_deletion_holds_history_idx
  on public.product_deletion_holds (product_id_snapshot, created_at desc);
alter table public.product_deletion_holds enable row level security;
revoke all on public.product_deletion_holds from public, anon, authenticated;
grant select, insert, update on public.product_deletion_holds to service_role;

-- Storage cleanup trusts an ownership registry written by the upload route.
-- It never derives a local Storage path from an arbitrary URL.
create table if not exists public.product_storage_assets (
  id uuid primary key default gen_random_uuid(),
  product_id text references public.products(id) on delete set null,
  bucket_id text not null default 'product-images' check (bucket_id = 'product-images'),
  storage_path text not null,
  public_url text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  upload_folder_id text not null,
  claimed_at timestamptz,
  cleanup_queued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, storage_path)
);

create index if not exists product_storage_assets_product_idx
  on public.product_storage_assets (product_id) where product_id is not null;
create index if not exists product_storage_assets_abandoned_idx
  on public.product_storage_assets (created_at)
  where product_id is null and cleanup_queued_at is null;
alter table public.product_storage_assets enable row level security;
revoke all on public.product_storage_assets from public, anon, authenticated;
grant select, insert, update, delete on public.product_storage_assets to service_role;

-- Claim a freshly uploaded asset in the same database transaction that
-- associates its URL with a product. The explicit RPC used by create routes is
-- retained as an idempotent fallback, but this trigger closes the crash window
-- between saving product_media and making the application-level claim call.
create or replace function private.claim_storage_asset_from_product_media()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.product_storage_assets
  set product_id = new.product_id, claimed_at = coalesce(claimed_at, now()), updated_at = now()
  where public_url = new.storage_reference
    and (product_id is null or product_id = new.product_id);
  return new;
end;
$$;

drop trigger if exists product_media_claim_storage_asset on public.product_media;
create trigger product_media_claim_storage_asset
after insert or update of storage_reference on public.product_media
for each row execute function private.claim_storage_asset_from_product_media();
revoke all on function private.claim_storage_asset_from_product_media() from public, anon, authenticated;

-- The eligibility queries use these paths repeatedly on large catalogs.
create index if not exists order_items_product_id_idx on public.order_items (product_id);
create index if not exists order_items_variant_id_idx on public.order_items (variant_id);

create or replace function private.append_product_deletion_blocker(
  p_blockers jsonb,
  p_code text,
  p_kind text,
  p_message text,
  p_resolution text,
  p_count integer default null,
  p_quantity numeric default null,
  p_href text default null
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select p_blockers || jsonb_build_object(
    'code', p_code,
    'kind', p_kind,
    'message', p_message,
    'resolution', p_resolution,
    'count', p_count,
    'quantity', p_quantity,
    'href', p_href
  );
$$;

revoke all on function private.append_product_deletion_blocker(jsonb, text, text, text, text, integer, numeric, text)
  from public, anon, authenticated;

create or replace function private.compute_product_deletion_eligibility(p_product_id text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_product record;
  v_immutable jsonb := '[]'::jsonb;
  v_temporary jsonb := '[]'::jsonb;
  v_count integer;
  v_quantity numeric;
  v_pristine boolean := true;
  v_has_hold boolean := false;
begin
  select * into v_product from public.products where id = p_product_id;
  if not found then
    return jsonb_build_object(
      'productId', p_product_id,
      'lifecycle', 'deleted',
      'canArchive', false,
      'canDeleteDraft', false,
      'canDeleteArchived', false,
      'mustRetainHistory', false,
      'hasTemporaryBlockers', false,
      'hasActiveHold', false,
      'immutableReasons', '[]'::jsonb,
      'temporaryBlockers', jsonb_build_array(jsonb_build_object(
        'code', 'PRODUCT_NOT_FOUND', 'kind', 'temporary',
        'message', 'This product no longer exists.',
        'resolution', 'Refresh the page.', 'count', null,
        'quantity', null, 'href', null
      )),
      'blockers', jsonb_build_array(jsonb_build_object(
        'code', 'PRODUCT_NOT_FOUND', 'kind', 'temporary',
        'message', 'This product no longer exists.',
        'resolution', 'Refresh the page.', 'count', null,
        'quantity', null, 'href', null
      ))
    );
  end if;

  -- Immutable reasons: once any exists, the product is retained Archived.
  select count(*) into v_count from public.reviews where product_id = p_product_id;
  if v_count > 0 then
    v_pristine := false;
    v_immutable := private.append_product_deletion_blocker(
      v_immutable, 'PRODUCT_HAS_REVIEWS', 'immutable',
      format('%s customer review(s) belong to this product.', v_count),
      'The reviews are part of permanent customer history, so the product must remain Archived.',
      v_count, null, null
    );
  end if;

  select count(*) into v_count
  from public.order_items oi
  where oi.product_id = p_product_id
     or oi.variant_id in (select id from public.product_variants where product_id = p_product_id);
  if v_count > 0 then
    v_pristine := false;
    v_immutable := private.append_product_deletion_blocker(
      v_immutable, 'PRODUCT_HAS_ORDER_HISTORY', 'immutable',
      format('%s order line(s) reference this product.', v_count),
      'Order and financial history must remain auditable, so the product must remain Archived.',
      v_count, null, '/admin/orders'
    );
  end if;

  select count(*) into v_count from public.inventory_movements where product_id = p_product_id;
  if v_count > 0 then
    v_pristine := false;
    v_immutable := private.append_product_deletion_blocker(
      v_immutable, 'PRODUCT_HAS_INVENTORY_HISTORY', 'immutable',
      format('%s inventory movement(s) reference this product.', v_count),
      'Inventory audit history is permanent, so the product must remain Archived.',
      v_count, null, '/admin/inventory'
    );
  end if;

  select count(*) into v_count
  from public.warehouse_transfer_items wti
  join public.warehouse_transfers wt on wt.id = wti.transfer_id
  where wti.variant_id in (select id from public.product_variants where product_id = p_product_id)
    and wt.status in ('received', 'rejected', 'cancelled');
  if v_count > 0 then
    v_pristine := false;
    v_immutable := private.append_product_deletion_blocker(
      v_immutable, 'PRODUCT_HAS_WAREHOUSE_HISTORY', 'immutable',
      format('%s warehouse document line(s) reference this product.', v_count),
      'Warehouse and return documents are permanent audit records, so the product must remain Archived.',
      v_count, null, '/admin/warehouse'
    );
  end if;

  -- Temporary blockers: after they are resolved, eligibility is recomputed.
  select coalesce(sum(quantity), 0) into v_quantity
  from public.product_variants where product_id = p_product_id;
  if v_quantity > 0 then
    v_pristine := false;
    v_temporary := private.append_product_deletion_blocker(
      v_temporary, 'PRODUCT_HAS_AVAILABLE_STOCK', 'temporary',
      format('%s sellable unit(s) are still available.', v_quantity),
      'Reduce or reconcile the available stock to zero, then run the check again.',
      null, v_quantity, '/brand-portal/stock'
    );
  end if;

  select coalesce(sum(brand_stock_quantity), 0) into v_quantity
  from public.product_variants where product_id = p_product_id;
  if v_quantity > 0 then
    v_pristine := false;
    v_temporary := private.append_product_deletion_blocker(
      v_temporary, 'PRODUCT_HAS_BRAND_STOCK', 'temporary',
      format('%s brand-held unit(s) are still recorded.', v_quantity),
      'Complete the related stock transfer or reconcile brand-held stock, then run the check again.',
      null, v_quantity, '/brand-portal/stock'
    );
  end if;

  select coalesce(sum(
    greatest(wti.requested_qty - coalesce(wti.received_ok_qty, 0)
      - coalesce(wti.damaged_qty, 0) - coalesce(wti.missing_qty, 0), 0)
  ), 0) into v_quantity
  from public.warehouse_transfer_items wti
  join public.warehouse_transfers wt on wt.id = wti.transfer_id
  where wt.status not in ('received', 'rejected', 'cancelled')
    and wti.variant_id in (select id from public.product_variants where product_id = p_product_id);
  if v_quantity > 0 then
    v_pristine := false;
    v_temporary := private.append_product_deletion_blocker(
      v_temporary, 'PRODUCT_HAS_OPEN_WAREHOUSE_DOCUMENT', 'temporary',
      format('%s unit(s) remain on open warehouse documents.', v_quantity),
      'Receive, reject, or cancel the warehouse documents, then run the check again.',
      null, v_quantity, '/brand-portal/warehouse'
    );
  end if;

  select count(*) into v_count
  from public.warehouse_transfer_items wti
  where wti.variant_id in (select id from public.product_variants where product_id = p_product_id)
    and (coalesce(wti.damaged_qty, 0) > 0 or coalesce(wti.missing_qty, 0) > 0)
    and wti.quarantine_resolved_at is null;
  if v_count > 0 then
    v_pristine := false;
    v_temporary := private.append_product_deletion_blocker(
      v_temporary, 'PRODUCT_HAS_UNRESOLVED_QUARANTINE', 'temporary',
      format('%s warehouse discrepancy line(s) remain unresolved.', v_count),
      'Resolve every damaged or missing-stock quarantine item, then run the check again.',
      v_count, null, '/admin/warehouse/quarantine'
    );
  end if;

  select count(*) into v_count
  from public.brand_fulfillment_transitions
  where brand_id = v_product.brand_id
    and status not in ('completed', 'cancelled', 'failed');
  if v_count > 0 then
    v_pristine := false;
    v_temporary := private.append_product_deletion_blocker(
      v_temporary, 'BRAND_HAS_OPEN_FULFILLMENT_TRANSITION', 'temporary',
      'The brand is changing fulfillment mode.',
      'Complete or cancel the fulfillment transition, then run the check again.',
      v_count, null, '/admin/brands'
    );
  end if;

  select exists(
    select 1 from public.product_deletion_holds
    where product_id = p_product_id and status = 'active'
  ) into v_has_hold;
  if v_has_hold then
    v_pristine := false;
    v_temporary := private.append_product_deletion_blocker(
      v_temporary, 'PRODUCT_HAS_ACTIVE_HOLD', 'temporary',
      'An active legal or administrative hold prevents deletion.',
      'An authorized admin must release the hold, then run the check again.',
      null, null, '/admin/products/archived'
    );
  end if;

  if v_product.status <> 'draft'
     or v_product.publish_date is not null
     or v_product.first_stocked_at is not null then
    v_pristine := false;
  end if;

  return jsonb_build_object(
    'productId', p_product_id,
    'lifecycle', case
      when v_product.status = 'archived' then 'archived'
      when v_product.status = 'published' and coalesce(v_product.paused_by_brand, false) then 'paused'
      when v_product.status = 'published' then 'published'
      else 'draft'
    end,
    'canArchive', v_product.status = 'published',
    'canDeleteDraft', v_product.status = 'draft' and v_pristine,
    'canDeleteArchived', v_product.status = 'archived'
      and jsonb_array_length(v_immutable) = 0
      and jsonb_array_length(v_temporary) = 0,
    'mustRetainHistory', jsonb_array_length(v_immutable) > 0,
    'hasTemporaryBlockers', jsonb_array_length(v_temporary) > 0,
    'hasActiveHold', v_has_hold,
    'immutableReasons', v_immutable,
    'temporaryBlockers', v_temporary,
    'blockers', v_immutable || v_temporary
  );
end;
$$;

revoke all on function private.compute_product_deletion_eligibility(text) from public, anon, authenticated;

create or replace function public.get_product_deletion_eligibility(p_product_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.compute_product_deletion_eligibility(p_product_id); $$;

revoke all on function public.get_product_deletion_eligibility(text) from public, anon, authenticated;
grant execute on function public.get_product_deletion_eligibility(text) to service_role;

create or replace function public.archive_product(
  p_product_id text,
  p_brand_id uuid,
  p_actor_id uuid,
  p_actor_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_product record;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;
  if p_brand_id is not null and v_product.brand_id <> p_brand_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
  end if;
  perform id from public.product_variants where product_id = p_product_id for update;
  if v_product.status = 'archived' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_ARCHIVED', 'message', 'Product is already Archived.', 'lifecycle', 'archived');
  end if;
  if v_product.status <> 'published' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_PUBLISHED', 'message', 'Only a Published or Paused product can be Archived.');
  end if;
  update public.products
  set status = 'archived', paused_by_brand = false, archived_at = now(), deletion_requested_at = null
  where id = p_product_id;
  return jsonb_build_object(
    'ok', true, 'code', 'PRODUCT_ARCHIVED', 'message', 'Product Archived.',
    'lifecycle', 'archived', 'before', to_jsonb(v_product),
    'eligibility', private.compute_product_deletion_eligibility(p_product_id)
  );
end;
$$;

revoke all on function public.archive_product(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.archive_product(text, uuid, uuid, text) to service_role;

-- Archived is terminal. Pause/Resume is the reversible path.
create or replace function private.enforce_archived_product_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'PRODUCT_ARCHIVED_IS_TERMINAL';
  end if;
  if old.status <> 'archived' and new.status = 'archived' then
    if old.status <> 'published' then
      raise exception 'PRODUCT_MUST_BE_PUBLISHED_BEFORE_ARCHIVE';
    end if;
    new.archived_at := coalesce(new.archived_at, now());
    new.paused_by_brand := false;
    new.deletion_requested_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists products_enforce_archived_transition on public.products;
create trigger products_enforce_archived_transition
before update of status on public.products
for each row execute function private.enforce_archived_product_transition();
revoke all on function private.enforce_archived_product_transition() from public, anon, authenticated;

create or replace function public.claim_product_storage_assets(
  p_product_id text,
  p_uploaded_by uuid,
  p_upload_folder_id text,
  p_public_urls text[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_claimed integer := 0;
begin
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;
  update public.product_storage_assets
  set product_id = p_product_id, claimed_at = now(), updated_at = now()
  where uploaded_by = p_uploaded_by
    and upload_folder_id = p_upload_folder_id
    and public_url = any(coalesce(p_public_urls, array[]::text[]))
    and (product_id is null or product_id = p_product_id);
  get diagnostics v_claimed = row_count;
  return v_claimed;
end;
$$;

revoke all on function public.claim_product_storage_assets(text, uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.claim_product_storage_assets(text, uuid, text, text[]) to service_role;

create or replace function private.queue_product_storage_cleanup(p_product_id text, p_actor_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare v_queued integer := 0;
begin
  insert into public.storage_cleanup_jobs (bucket_id, storage_path, owner_user_id)
  select asset.bucket_id, asset.storage_path, p_actor_id
  from public.product_storage_assets asset
  where asset.product_id = p_product_id and asset.cleanup_queued_at is null
    and not exists (
      select 1 from public.product_storage_assets shared
      where shared.bucket_id = asset.bucket_id
        and shared.storage_path = asset.storage_path
        and shared.product_id is distinct from p_product_id
        and shared.product_id is not null
    )
    and not exists (
      select 1 from public.product_media shared_media
      where shared_media.storage_reference = asset.public_url
        and shared_media.product_id <> p_product_id
    )
  on conflict (bucket_id, storage_path) do nothing;
  get diagnostics v_queued = row_count;

  update public.product_storage_assets
  set cleanup_queued_at = now(), updated_at = now()
  where product_id = p_product_id and cleanup_queued_at is null;
  return v_queued;
end;
$$;

revoke all on function private.queue_product_storage_cleanup(text, uuid) from public, anon, authenticated;

create or replace function public.queue_abandoned_product_uploads(
  p_older_than interval default interval '24 hours',
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer := 0;
begin
  with candidates as (
    select id, bucket_id, storage_path, uploaded_by
    from public.product_storage_assets
    where product_id is null and cleanup_queued_at is null
      and created_at < now() - greatest(p_older_than, interval '1 hour')
    order by created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  ), queued as (
    insert into public.storage_cleanup_jobs (bucket_id, storage_path, owner_user_id)
    select bucket_id, storage_path, uploaded_by from candidates
    on conflict (bucket_id, storage_path) do nothing
    returning bucket_id, storage_path
  )
  update public.product_storage_assets asset
  set cleanup_queued_at = now(), updated_at = now()
  where asset.id in (select id from candidates);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.queue_abandoned_product_uploads(interval, integer) from public, anon, authenticated;
grant execute on function public.queue_abandoned_product_uploads(interval, integer) to service_role;

create or replace function private.delete_product_permanently(
  p_product_id text,
  p_brand_id uuid,
  p_actor_id uuid,
  p_actor_label text,
  p_reason text,
  p_operation_key text,
  p_expected_state text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_product record;
  v_eligibility jsonb;
  v_existing record;
  v_queued integer := 0;
begin
  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_KEY_REQUIRED', 'message', 'A valid operation key is required.');
  end if;

  select * into v_existing from public.product_deletion_history
  where product_id_snapshot = p_product_id and operation_key = p_operation_key;
  if found then
    if v_existing.deleted_by is distinct from p_actor_id
       or v_existing.deleted_from <> p_expected_state
       or v_existing.reason is distinct from nullif(trim(coalesce(p_reason, '')), '') then
      return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT', 'message', 'This operation key was used for a different deletion.');
    end if;
    return jsonb_build_object('ok', true, 'code', 'ALREADY_DELETED', 'message', 'Product was already permanently deleted.', 'lifecycle', 'deleted');
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    -- A concurrent retry can arrive after the first transaction deleted the
    -- product. Re-read the durable history under the same idempotency key so
    -- it receives the original success (or a conflict), not PRODUCT_NOT_FOUND.
    select * into v_existing from public.product_deletion_history
    where product_id_snapshot = p_product_id and operation_key = p_operation_key;
    if found then
      if v_existing.deleted_by is distinct from p_actor_id
         or v_existing.deleted_from <> p_expected_state
         or v_existing.reason is distinct from nullif(trim(coalesce(p_reason, '')), '') then
        return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT', 'message', 'This operation key was used for a different deletion.');
      end if;
      return jsonb_build_object('ok', true, 'code', 'ALREADY_DELETED', 'message', 'Product was already permanently deleted.', 'lifecycle', 'deleted');
    end if;
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.');
  end if;
  if p_brand_id is not null and v_product.brand_id <> p_brand_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_OWNED', 'message', 'You do not have access to this product.');
  end if;
  perform id from public.product_variants where product_id = p_product_id for update;

  v_eligibility := private.compute_product_deletion_eligibility(p_product_id);
  if p_expected_state = 'draft' then
    if coalesce((v_eligibility->>'canDeleteDraft')::boolean, false) is not true then
      return jsonb_build_object(
        'ok', false, 'code', 'DRAFT_NOT_PRISTINE',
        'message', 'Only a completely pristine Draft can be permanently deleted.',
        'blockers', v_eligibility->'blockers'
      );
    end if;
  elsif p_expected_state = 'archived' then
    if v_product.status <> 'archived' then
      return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_ARCHIVED', 'message', 'Archive this product before permanent deletion.');
    end if;
    if coalesce((v_eligibility->>'mustRetainHistory')::boolean, false) then
      return jsonb_build_object(
        'ok', false, 'code', 'PRODUCT_MUST_REMAIN_ARCHIVED',
        'message', 'This product has permanent business history and must remain Archived.',
        'blockers', v_eligibility->'immutableReasons'
      );
    end if;
    if coalesce((v_eligibility->>'hasTemporaryBlockers')::boolean, false) then
      return jsonb_build_object(
        'ok', false, 'code', 'PRODUCT_DELETION_BLOCKED',
        'message', 'Resolve every temporary blocker, then run the deletion check again.',
        'blockers', v_eligibility->'temporaryBlockers'
      );
    end if;
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_DELETION_STATE', 'message', 'Invalid deletion state.');
  end if;

  v_queued := private.queue_product_storage_cleanup(p_product_id, p_actor_id);

  insert into public.product_deletion_history (
    product_id_snapshot, product_name_snapshot, product_sku_snapshot,
    product_image_snapshot, brand_id, deleted_from, deleted_by,
    deleted_by_label, reason, eligibility_snapshot, media_jobs_queued,
    operation_key
  ) values (
    v_product.id, v_product.name, v_product.sku, v_product.image,
    v_product.brand_id, p_expected_state, p_actor_id, p_actor_label,
    nullif(trim(coalesce(p_reason, '')), ''), v_eligibility, v_queued,
    p_operation_key
  );

  delete from public.products where id = p_product_id;
  if not found then
    raise exception 'PRODUCT_DELETE_RACE';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', case when p_expected_state = 'draft' then 'DRAFT_DELETED' else 'ARCHIVED_PRODUCT_DELETED' end,
    'message', 'Product permanently deleted.',
    'lifecycle', 'deleted',
    'before', to_jsonb(v_product),
    'mediaJobsQueued', v_queued
  );
end;
$$;

revoke all on function private.delete_product_permanently(text, uuid, uuid, text, text, text, text)
  from public, anon, authenticated;

create or replace function public.delete_draft_product(
  p_product_id text, p_brand_id uuid, p_actor_id uuid, p_actor_label text,
  p_reason text, p_operation_key text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.delete_product_permanently(
    p_product_id, p_brand_id, p_actor_id, p_actor_label,
    p_reason, p_operation_key, 'draft'
  );
$$;

revoke all on function public.delete_draft_product(text, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.delete_draft_product(text, uuid, uuid, text, text, text) to service_role;

create or replace function public.delete_archived_product(
  p_product_id text, p_brand_id uuid, p_actor_id uuid, p_actor_label text,
  p_reason text, p_operation_key text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.delete_product_permanently(
    p_product_id, p_brand_id, p_actor_id, p_actor_label,
    p_reason, p_operation_key, 'archived'
  );
$$;

revoke all on function public.delete_archived_product(text, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.delete_archived_product(text, uuid, uuid, text, text, text) to service_role;

create or replace function public.apply_product_deletion_hold(
  p_product_id text, p_actor_id uuid, p_actor_label text, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_product record; v_hold record;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.'); end if;
  if v_product.status <> 'archived' then
    return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_ARCHIVED', 'message', 'A deletion hold is only relevant to an Archived product.');
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'HOLD_REASON_REQUIRED', 'message', 'A hold reason is required.');
  end if;
  if exists (select 1 from public.product_deletion_holds where product_id = p_product_id and status = 'active') then
    return jsonb_build_object('ok', true, 'code', 'HOLD_ALREADY_ACTIVE', 'message', 'A hold is already active.');
  end if;
  insert into public.product_deletion_holds (
    product_id, product_id_snapshot, product_name_snapshot, brand_id,
    reason, created_by, created_by_label
  ) values (
    p_product_id, p_product_id, v_product.name, v_product.brand_id,
    trim(p_reason), p_actor_id, p_actor_label
  ) returning * into v_hold;
  return jsonb_build_object('ok', true, 'code', 'HOLD_APPLIED', 'message', 'Deletion hold applied.', 'holdId', v_hold.id);
end;
$$;

revoke all on function public.apply_product_deletion_hold(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.apply_product_deletion_hold(text, uuid, text, text) to service_role;

create or replace function public.release_product_deletion_hold(
  p_product_id text, p_actor_id uuid, p_actor_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_product record; v_hold record;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'PRODUCT_NOT_FOUND', 'message', 'This product no longer exists.'); end if;
  select * into v_hold from public.product_deletion_holds
  where product_id = p_product_id and status = 'active' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'HOLD_NOT_FOUND', 'message', 'No active hold exists.'); end if;
  update public.product_deletion_holds
  set status = 'released', released_by = p_actor_id,
      released_by_label = p_actor_label, released_at = now()
  where id = v_hold.id;
  return jsonb_build_object('ok', true, 'code', 'HOLD_RELEASED', 'message', 'Deletion hold released.');
end;
$$;

revoke all on function public.release_product_deletion_hold(text, uuid, text) from public, anon, authenticated;
grant execute on function public.release_product_deletion_hold(text, uuid, text) to service_role;

create or replace function public.admin_emergency_hide_product(
  p_product_id text, p_actor_id uuid, p_actor_label text, p_reason text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select public.archive_product(p_product_id, null, p_actor_id, p_actor_label); $$;

revoke all on function public.admin_emergency_hide_product(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_emergency_hide_product(text, uuid, text, text) to service_role;

-- Checkout defense in depth.
create or replace function private.enforce_order_item_product_available()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_status text; v_paused boolean; v_product_id text;
begin
  v_product_id := new.product_id;
  if v_product_id is null and new.variant_id is not null then
    select product_id into v_product_id from public.product_variants where id = new.variant_id;
  end if;
  if v_product_id is null then return new; end if;
  select status, coalesce(paused_by_brand, false)
  into v_status, v_paused
  from public.products where id = v_product_id;
  if v_status is distinct from 'published' or v_paused then
    raise exception 'PRODUCT_NOT_AVAILABLE_FOR_ORDER';
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_enforce_product_available on public.order_items;
create trigger order_items_enforce_product_available
before insert on public.order_items
for each row execute function private.enforce_order_item_product_available();
revoke all on function private.enforce_order_item_product_available() from public, anon, authenticated;

-- Service-role reads must not bypass storefront availability.
create or replace view public.storefront_products
with (security_invoker = true)
as
select
  p.id, p.name, p.brand_name, p.brand_slug, p.brand_id, p.product_type_id,
  p.audience, p.collection_id, p.material, p.materials, p.fit, p.price,
  p.discount_percent, p.discount_ends_at, p.currency, p.image, p.images,
  p.rating, p.review_count, p.description, p.details, p.care_instructions,
  p.shipping_returns, p.model_height, p.model_wearing, p.sku, p.is_new,
  p.featured, p.status, p.publish_date, p.paused_by_brand,
  p.default_low_stock_threshold, p.created_at, p.first_stocked_at
from public.products p
where p.status = 'published'
  and coalesce(p.paused_by_brand, false) = false
  and (p.publish_date is null or p.publish_date <= now())
  and exists (select 1 from public.brands b where b.id = p.brand_id and b.is_active = true)
  and private.is_product_storefront_launch_gated(p.brand_id, p.first_stocked_at);

grant select on public.storefront_products to anon, authenticated, service_role;

create or replace function private.search_archived_products(
  p_brand_id uuid default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_total integer;
  v_rows jsonb;
begin
  select count(*) into v_total
  from public.products p
  where p.status = 'archived'
    and (p_brand_id is null or p.brand_id = p_brand_id)
    and (v_search is null or p.name ilike '%' || v_search || '%'
      or p.sku ilike '%' || v_search || '%' or p.id ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(row_data order by archived_at desc nulls last), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'sku', p.sku, 'image', p.image,
      'brandId', p.brand_id, 'brandName', p.brand_name,
      'archivedAt', p.archived_at,
      'eligibility', private.compute_product_deletion_eligibility(p.id)
    ) row_data, p.archived_at
    from public.products p
    where p.status = 'archived'
      and (p_brand_id is null or p.brand_id = p_brand_id)
      and (v_search is null or p.name ilike '%' || v_search || '%'
        or p.sku ilike '%' || v_search || '%' or p.id ilike '%' || v_search || '%')
    order by p.archived_at desc nulls last
    limit v_limit offset v_offset
  ) page;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
end;
$$;

revoke all on function private.search_archived_products(uuid, text, integer, integer) from public, anon, authenticated;

create or replace function public.search_archived_products(
  p_brand_id uuid default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.search_archived_products(p_brand_id, p_search, p_limit, p_offset); $$;

revoke all on function public.search_archived_products(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.search_archived_products(uuid, text, integer, integer) to service_role;

create or replace function private.search_product_deletion_history(
  p_brand_id uuid default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_total integer;
  v_rows jsonb;
begin
  select count(*) into v_total from public.product_deletion_history h
  where (p_brand_id is null or h.brand_id = p_brand_id)
    and (v_search is null or h.product_name_snapshot ilike '%' || v_search || '%'
      or h.product_sku_snapshot ilike '%' || v_search || '%'
      or h.product_id_snapshot ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(to_jsonb(page) order by deleted_at desc), '[]'::jsonb) into v_rows
  from (
    select h.* from public.product_deletion_history h
    where (p_brand_id is null or h.brand_id = p_brand_id)
      and (v_search is null or h.product_name_snapshot ilike '%' || v_search || '%'
        or h.product_sku_snapshot ilike '%' || v_search || '%'
        or h.product_id_snapshot ilike '%' || v_search || '%')
    order by h.deleted_at desc limit v_limit offset v_offset
  ) page;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
end;
$$;

revoke all on function private.search_product_deletion_history(uuid, text, integer, integer) from public, anon, authenticated;

create or replace function public.search_product_deletion_history(
  p_brand_id uuid default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.search_product_deletion_history(p_brand_id, p_search, p_limit, p_offset); $$;

revoke all on function public.search_product_deletion_history(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.search_product_deletion_history(uuid, text, integer, integer) to service_role;
