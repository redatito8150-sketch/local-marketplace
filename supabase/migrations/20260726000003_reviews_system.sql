-- Production review lifecycle. Additive only: no existing rows are changed.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  product_id text not null references public.products(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  title text check (title is null or char_length(title) <= 120),
  body text not null check (char_length(body) between 10 and 2000),
  status text not null default 'published'
    check (status in ('published','pending','under_review','hidden','removed')),
  moderation_reason text check (moderation_reason is null or char_length(moderation_reason) <= 500),
  published_at timestamptz default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_item_id)
);

create table if not exists public.review_images (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  storage_path text not null unique,
  display_order smallint not null default 0 check (display_order between 0 and 4),
  created_at timestamptz not null default now(),
  unique (review_id, display_order)
);

create table if not exists public.review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.reviews(id) on delete cascade,
  brand_slug text not null references public.brands(slug) on delete restrict,
  body text not null check (char_length(body) between 2 and 1500),
  replied_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_helpful_votes (
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam','offensive','personal_information','unrelated','suspected_fake','other')),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  resolution_notes text check (resolution_notes is null or char_length(resolution_notes) <= 1000),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (review_id, reporter_user_id)
);

create index if not exists reviews_public_product_idx
  on public.reviews(product_id, created_at desc)
  where status = 'published' and deleted_at is null;
create index if not exists reviews_user_idx on public.reviews(user_id, created_at desc);
create index if not exists review_images_review_idx on public.review_images(review_id, display_order);
create index if not exists review_replies_brand_idx on public.review_replies(brand_slug, created_at desc);
create index if not exists review_helpful_review_idx on public.review_helpful_votes(review_id);
create index if not exists review_reports_queue_idx on public.review_reports(status, created_at desc);

create or replace function public.review_purchase_is_eligible(
  p_user_id uuid, p_product_id text, p_order_item_id uuid
) returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.products p on p.id = oi.product_id
    where oi.id = p_order_item_id
      and oi.product_id = p_product_id
      and o.user_id = p_user_id
      and o.status = 'fulfilled'
      and o.payment_status <> 'refunded'
      and p.status = 'published'
  );
$$;

create or replace function public.set_review_timestamps()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  if tg_op = 'UPDATE' and new.status = 'published' and old.status <> 'published' then
    new.published_at = now();
  end if;
  return new;
end;
$$;

create or replace function public.protect_review_purchase_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.user_id <> old.user_id or new.product_id <> old.product_id or new.order_item_id <> old.order_item_id then
    raise exception 'Review purchase identity cannot be changed';
  end if;
  return new;
end;
$$;
drop trigger if exists reviews_protect_purchase_identity on public.reviews;
create trigger reviews_protect_purchase_identity before update on public.reviews
for each row execute function public.protect_review_purchase_identity();
drop trigger if exists reviews_set_timestamps on public.reviews;
create trigger reviews_set_timestamps before update on public.reviews
for each row execute function public.set_review_timestamps();

create or replace function public.set_review_reply_timestamp()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists review_replies_set_timestamp on public.review_replies;
create trigger review_replies_set_timestamp before update on public.review_replies
for each row execute function public.set_review_reply_timestamp();

alter table public.reviews enable row level security;
alter table public.review_images enable row level security;
alter table public.review_replies enable row level security;
alter table public.review_helpful_votes enable row level security;
alter table public.review_reports enable row level security;

drop policy if exists "Public reads published reviews" on public.reviews;
create policy "Public reads published reviews" on public.reviews for select
using (status = 'published' and deleted_at is null);
drop policy if exists "Customers create eligible reviews" on public.reviews;
create policy "Customers create eligible reviews" on public.reviews for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'published' and deleted_at is null
  and public.review_purchase_is_eligible((select auth.uid()), product_id, order_item_id)
);
drop policy if exists "Customers update own reviews" on public.reviews;
create policy "Customers update own reviews" on public.reviews for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
);

drop policy if exists "Public reads images for public reviews" on public.review_images;
create policy "Public reads images for public reviews" on public.review_images for select
using (exists (select 1 from public.reviews r where r.id = review_id and r.status='published' and r.deleted_at is null));
drop policy if exists "Customers manage own review images" on public.review_images;
create policy "Customers manage own review images" on public.review_images for all to authenticated
using (exists (select 1 from public.reviews r where r.id=review_id and r.user_id=(select auth.uid())))
with check (exists (select 1 from public.reviews r where r.id=review_id and r.user_id=(select auth.uid())));

drop policy if exists "Public reads replies to public reviews" on public.review_replies;
create policy "Public reads replies to public reviews" on public.review_replies for select
using (exists (select 1 from public.reviews r where r.id=review_id and r.status='published' and r.deleted_at is null));
drop policy if exists "Brand members manage own replies" on public.review_replies;
create policy "Brand members manage own replies" on public.review_replies for all to authenticated
using (
  exists (select 1 from public.brands b where b.slug=brand_slug and b.owner_user_id=(select auth.uid()))
  or exists (select 1 from public.brand_staff s where s.brand_slug=brand_slug and s.user_id=(select auth.uid()))
)
with check (
  replied_by=(select auth.uid())
  and exists (
    select 1 from public.reviews r join public.products p on p.id=r.product_id
    where r.id=review_id and p.brand_slug=brand_slug
  )
  and (
    exists (select 1 from public.brands b where b.slug=brand_slug and b.owner_user_id=(select auth.uid()))
    or exists (select 1 from public.brand_staff s where s.brand_slug=brand_slug and s.user_id=(select auth.uid()))
  )
);

drop policy if exists "Users read own helpful votes" on public.review_helpful_votes;
create policy "Users read own helpful votes" on public.review_helpful_votes for select to authenticated
using (user_id=(select auth.uid()));
drop policy if exists "Users toggle own helpful votes" on public.review_helpful_votes;
create policy "Users toggle own helpful votes" on public.review_helpful_votes for all to authenticated
using (user_id=(select auth.uid()))
with check (
  user_id=(select auth.uid())
  and not exists (select 1 from public.reviews r where r.id=review_id and r.user_id=(select auth.uid()))
);

drop policy if exists "Users read own reports" on public.review_reports;
create policy "Users read own reports" on public.review_reports for select to authenticated
using (reporter_user_id=(select auth.uid()));
drop policy if exists "Users create own reports" on public.review_reports;
create policy "Users create own reports" on public.review_reports for insert to authenticated
with check (
  reporter_user_id=(select auth.uid())
  and status='open' and reviewed_by is null
  and not exists (select 1 from public.reviews r where r.id=review_id and r.user_id=(select auth.uid()))
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-images','review-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Review authors upload review images" on storage.objects;
create policy "Review authors upload review images" on storage.objects for insert to authenticated
with check (bucket_id='review-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Review authors delete review images" on storage.objects;
create policy "Review authors delete review images" on storage.objects for delete to authenticated
using (bucket_id='review-images' and (storage.foldername(name))[1]=(select auth.uid())::text);

grant select on public.reviews, public.review_images, public.review_replies to anon, authenticated;
grant insert, update on public.reviews to authenticated;
grant insert, update, delete on public.review_images, public.review_replies, public.review_helpful_votes to authenticated;
grant select, insert on public.review_helpful_votes, public.review_reports to authenticated;
revoke all on function public.review_purchase_is_eligible(uuid,text,uuid) from public, anon;
grant execute on function public.review_purchase_is_eligible(uuid,text,uuid) to authenticated;

-- Rollback (only if the feature has not received production data):
-- drop table public.review_reports, public.review_helpful_votes, public.review_replies,
--   public.review_images, public.reviews cascade;
-- drop function public.review_purchase_is_eligible(uuid,text,uuid);
