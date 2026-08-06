-- "Notify me when back in stock" — a customer subscribes to a specific
-- variant (the exact Color+Size combo they wanted, not the whole product,
-- since one color/size can be sold out while others aren't). One row per
-- (user, variant); deleted the moment the subscriber is actually notified
-- (see lib/backInStock.ts's checkAndNotifyRestock) rather than kept around
-- with a notified_at flag — this is meant to be a one-shot request, not a
-- standing watch, so re-subscribing after a second stockout is explicit.
-- All reads/writes happen server-side via supabaseAdmin (same convention
-- as user_notifications) — RLS below is defense in depth, not the actual
-- access path.

create table if not exists public.back_in_stock_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Denormalized from auth.users at subscribe time (the subscriber is
  -- always the authenticated caller then, so it's free to capture) rather
  -- than looked up again via the admin API when the restock notification
  -- actually fires — one less thing that can fail on the notify path.
  email text not null,
  product_id text not null references public.products(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, variant_id)
);

create index if not exists back_in_stock_subscriptions_variant_id_idx
  on public.back_in_stock_subscriptions (variant_id);

alter table public.back_in_stock_subscriptions enable row level security;

drop policy if exists "Users manage own back-in-stock subscriptions" on public.back_in_stock_subscriptions;
create policy "Users manage own back-in-stock subscriptions"
  on public.back_in_stock_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users cancel own back-in-stock subscriptions" on public.back_in_stock_subscriptions;
create policy "Users cancel own back-in-stock subscriptions"
  on public.back_in_stock_subscriptions for delete
  to authenticated
  using (user_id = auth.uid());
