-- One-off cleanup for the production migration-verification fixture.
--
-- This is deliberately keyed by every stable identifier and aborts if any
-- customer/order history exists. The inventory ledger trigger is disabled
-- only while the two known synthetic movements are removed, then restored in
-- the same transaction.

begin;

do $$
declare
  v_brand_id constant uuid := 'ce602adc-cb4b-41ef-abf0-efbc0e298c47';
  v_brand_slug constant text := 'migration-verify-e592656d';
  v_product_id constant text := 'migration-verify-product-e592656d';
begin
  if not exists (
    select 1
    from public.brands b
    where b.id = v_brand_id
      and b.slug = v_brand_slug
      and b.name = '[TEST DATA - DO NOT USE] Migration Verify'
      and b.is_active = false
  ) then
    return;
  end if;

  if not exists (
    select 1
    from public.products p
    where p.id = v_product_id
      and p.brand_id = v_brand_id
      and p.name = 'Migration Verify Product'
      and p.sku = 'E59265-000001'
      and p.status = 'archived'
  ) then
    raise exception 'Migration verification product no longer matches the known test fixture';
  end if;

  if exists (
    select 1 from public.orders o where o.brand_slug = v_brand_slug
    union all
    select 1 from public.order_items oi
      where oi.brand_slug = v_brand_slug or oi.product_id = v_product_id
    union all
    select 1 from public.reviews r where r.product_id = v_product_id
    union all
    select 1 from public.review_replies rr where rr.brand_slug = v_brand_slug
  ) then
    raise exception 'Refusing to remove migration fixture because customer history exists';
  end if;

  if (
    select count(*)
    from public.inventory_movements im
    where im.brand_id = v_brand_id or im.product_id = v_product_id
  ) <> 2 then
    raise exception 'Migration fixture inventory history differs from the two known synthetic movements';
  end if;

  if exists (
    select 1
    from public.inventory_movements im
    where (im.brand_id = v_brand_id or im.product_id = v_product_id)
      and im.id not in (
        '540db40e-688a-4ddc-82e7-ff8c89c7d23b',
        'a72eadba-5294-48bb-8696-72c083c0800d'
      )
  ) then
    raise exception 'Unexpected inventory movement found for migration fixture';
  end if;

  insert into public.storage_cleanup_jobs (bucket_id, storage_path, owner_user_id)
  select psa.bucket_id, psa.storage_path, psa.uploaded_by
  from public.product_storage_assets psa
  where psa.product_id = v_product_id
  on conflict (bucket_id, storage_path) do nothing;

  update public.product_storage_assets
  set cleanup_queued_at = coalesce(cleanup_queued_at, now()), updated_at = now()
  where product_id = v_product_id;

  delete from public.warehouse_transfers wt where wt.brand_id = v_brand_id;

  alter table public.inventory_movements
    disable trigger inventory_movements_immutable;

  delete from public.inventory_movements im
  where im.id in (
    '540db40e-688a-4ddc-82e7-ff8c89c7d23b',
    'a72eadba-5294-48bb-8696-72c083c0800d'
  )
    and im.brand_id = v_brand_id
    and im.product_id = v_product_id;

  alter table public.inventory_movements
    enable trigger inventory_movements_immutable;

  delete from public.products p
  where p.id = v_product_id and p.brand_id = v_brand_id;

  delete from public.brands b
  where b.id = v_brand_id and b.slug = v_brand_slug;
end;
$$;

commit;

;
