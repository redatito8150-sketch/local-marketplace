-- ============================================================================
-- Admin Payments page backend + payment-field immutability hardening
-- ============================================================================
-- Two independent, unrelated pieces bundled in one migration:
--
-- 1. list_payment_attempt_fulfillments_for_admin() — admin-only visibility
--    into private.payment_attempt_fulfillments (the per-bucket fulfillment
--    ledger), which today has zero PostgREST/RPC surface at all. Backs the
--    new /admin/payments/[id] detail page's bucket breakdown.
--
-- 2. An explicit `revoke update on public.orders` — NOT a bugfix. A full
--    audit this session (every migration's UPDATE statements, every
--    application .update() call, every admin/brand-portal UI component,
--    and orders' own RLS policies) confirmed orders.payment_method/
--    payment_status are already fully immutable after creation: no
--    function ever sets them outside place_order/place_paid_order's
--    original INSERT, the one .update() call in the app
--    (app/api/admin/orders/[id]/route.ts) only ever touches internal_notes,
--    no UI renders an editable control for either field, and orders has no
--    UPDATE/ALL RLS policy for any non-service_role — so a direct
--    PostgREST update from a customer or brand-owner session is already
--    blocked by RLS regardless of grants. Today that guarantee rests on
--    "no policy exists"; this makes it rest on "no policy AND no grant",
--    matching the same belt-and-suspenders pattern already used for
--    `reviews` (see 20260810000004_rls_and_column_privacy_boundaries.sql).
-- ============================================================================

create or replace function public.list_payment_attempt_fulfillments_for_admin(p_payment_attempt_id uuid)
returns table (
  bucket_key text,
  brand_id uuid,
  brand_name text,
  brand_slug text,
  status text,
  order_id uuid,
  expected_amount_cents integer,
  failure_reason text,
  fulfilled_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.bucket_key,
    f.brand_id,
    b.name,
    b.slug,
    f.status,
    f.order_id,
    f.expected_amount_cents,
    f.failure_reason,
    f.fulfilled_at
  from private.payment_attempt_fulfillments f
  left join public.brands b on b.id = f.brand_id
  where f.payment_attempt_id = p_payment_attempt_id
  order by f.bucket_key;
$$;

revoke all on function public.list_payment_attempt_fulfillments_for_admin(uuid)
  from public, anon, authenticated;
grant execute on function public.list_payment_attempt_fulfillments_for_admin(uuid)
  to service_role;

revoke update on public.orders from authenticated, anon;
