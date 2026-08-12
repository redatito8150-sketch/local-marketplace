-- Cart-reconciliation read path — lets a customer's own browser find out
-- exactly which line items (productId/size/color/quantity) it was charged
-- for on ONE of its own fully-fulfilled payment attempts, so the frontend
-- can remove precisely those quantities from whatever the cart currently
-- holds instead of blindly clearing it (which would also wipe out any
-- items added to the cart after that payment was made — a real data-loss
-- risk if reconciliation runs late, e.g. after the browser was closed
-- mid-payment and reopened later).
--
-- payment_attempts.cart_snapshot is deliberately NOT in the base column
-- grant (supabase/migrations/20260811000001_payment_attempts.sql) — this
-- is a narrow, purpose-built read of just four fields from it, following
-- the same "ownership-checked, safe to grant directly to authenticated"
-- pattern already used by payment_attempt_fulfillment_summary. Only ever
-- returns rows once status = 'fulfilled' — before that there is nothing
-- legitimate to reconcile, and this function is the only path that can
-- read cart_snapshot content at all from the client side.
create or replace function public.get_fulfilled_cart_snapshot_items(p_payment_attempt_id uuid)
returns table (product_id text, size text, color text, quantity int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    item->>'productId',
    item->>'size',
    coalesce(item->>'color', ''),
    (item->>'quantity')::int
  from public.payment_attempts pa,
       jsonb_array_elements(pa.cart_snapshot) as item
  where pa.id = p_payment_attempt_id
    and pa.user_id = (select auth.uid())
    and pa.status = 'fulfilled';
$$;

revoke all on function public.get_fulfilled_cart_snapshot_items(uuid) from public;
grant execute on function public.get_fulfilled_cart_snapshot_items(uuid) to authenticated, service_role;
