-- The storefront currently supports cash on delivery only. Persist that fact
-- explicitly instead of implying that an unrecorded card charge took place.
alter table public.orders
  add column if not exists payment_method text not null default 'cash_on_delivery';
alter table public.orders
  drop constraint if exists orders_payment_method_check;
alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('cash_on_delivery'));

alter table public.orders
  add column if not exists payment_status text not null default 'unpaid';
alter table public.orders
  drop constraint if exists orders_payment_status_check;
alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'refunded'));
