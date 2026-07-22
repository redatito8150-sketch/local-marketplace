-- Security boundary hardening for public PostgREST access.
-- Additive and idempotent: it does not delete business data.

-- Trigger-only and privileged mutation functions must not be callable through
-- the public API roles. Server routes use the service-role client explicitly.
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;

revoke all on function public.prune_old_notifications() from public;
revoke all on function public.prune_old_notifications() from anon, authenticated;

revoke all on function public.cancel_order(uuid) from public;
revoke all on function public.cancel_order(uuid) from anon, authenticated;
grant execute on function public.cancel_order(uuid) to service_role;

revoke all on function public.place_order(text, text, text, text, text, text, uuid, jsonb, text)
  from public;
revoke all on function public.place_order(text, text, text, text, text, text, uuid, jsonb, text)
  from anon, authenticated;
grant execute on function public.place_order(text, text, text, text, text, text, uuid, jsonb, text)
  to service_role;

-- This helper participates in an authenticated order policy. Keep it
-- unavailable to anonymous callers while retaining the minimum policy role.
revoke all on function public.brand_owns_order_item(uuid) from public;
revoke all on function public.brand_owns_order_item(uuid) from anon;
grant execute on function public.brand_owns_order_item(uuid) to authenticated, service_role;

drop policy if exists "Brand owners can read orders containing their items" on public.orders;
create policy "Brand owners can read orders containing their items"
  on public.orders for select
  to authenticated
  using (public.brand_owns_order_item(orders.id));

-- Public storefront reads see only live products. Authenticated brand members
-- receive a separate owner-scoped policy for their workflow states.
drop policy if exists "Public can read products" on public.products;
drop policy if exists "Public can read published products" on public.products;
create policy "Public can read published products"
  on public.products for select
  to anon, authenticated
  using (status = 'published' and coalesce(paused_by_brand, false) = false);

drop policy if exists "Brand members can read their products" on public.products;
create policy "Brand members can read their products"
  on public.products for select
  to authenticated
  using (
    brand_slug in (
      select b.slug from public.brands b where b.owner_user_id = auth.uid()
    )
    or brand_slug in (
      select bs.brand_slug from public.brand_staff bs where bs.user_id = auth.uid()
    )
  );

-- Variant visibility follows the parent product. This prevents anonymous
-- inventory reads for draft/archived products while preserving storefront
-- variant selection and brand-portal inventory access.
drop policy if exists "Public can read product variants" on public.product_variants;
drop policy if exists "Public can read published product variants" on public.product_variants;
create policy "Public can read published product variants"
  on public.product_variants for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_variants.product_id
        and p.status = 'published'
        and coalesce(p.paused_by_brand, false) = false
    )
  );

drop policy if exists "Brand members can read their product variants" on public.product_variants;
create policy "Brand members can read their product variants"
  on public.product_variants for select
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_variants.product_id
        and (
          p.brand_slug in (
            select b.slug from public.brands b where b.owner_user_id = auth.uid()
          )
          or p.brand_slug in (
            select bs.brand_slug from public.brand_staff bs where bs.user_id = auth.uid()
          )
        )
    )
  );

