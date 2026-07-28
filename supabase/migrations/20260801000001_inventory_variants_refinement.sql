-- Inventory & Variants refinement: lifecycle-managed private catalog data,
-- taxonomy-aware size profiles, and one authoritative product media order.
-- Forward-only; existing variant ids, SKUs, combo_key values and files remain unchanged.

alter table public.option_types
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.option_values
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.collections
  add column if not exists archived_at timestamptz;

create table if not exists public.size_profiles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.size_profile_values (
  size_profile_id uuid not null references public.size_profiles(id) on delete cascade,
  option_value_id uuid not null references public.option_values(id) on delete restrict,
  sort_order integer not null default 0,
  primary key (size_profile_id, option_value_id)
);

create table if not exists public.taxonomy_size_profiles (
  taxonomy_node_id uuid not null references public.taxonomy_nodes(id) on delete cascade,
  size_profile_id uuid not null references public.size_profiles(id) on delete cascade,
  priority integer not null default 0,
  primary key (taxonomy_node_id, size_profile_id)
);

alter table public.size_profiles enable row level security;
alter table public.size_profile_values enable row level security;
alter table public.taxonomy_size_profiles enable row level security;
create policy "Size profiles are publicly readable" on public.size_profiles for select using (true);
create policy "Size profile values are publicly readable" on public.size_profile_values for select using (true);
create policy "Taxonomy size profiles are publicly readable" on public.taxonomy_size_profiles for select using (true);

insert into public.size_profiles (key, name, sort_order) values
  ('standard-apparel', 'Standard Apparel', 10),
  ('extended-apparel', 'Extended Apparel', 20),
  ('alpha-kids', 'Alpha Kids', 30),
  ('baby-age', 'Baby Age', 40),
  ('kids-numeric', 'Kids Numeric', 50),
  ('waist-numeric', 'Waist Numeric', 60),
  ('trousers-waist-inseam', 'Trousers Waist and Inseam', 70),
  ('eu-shoes', 'EU Shoes', 80),
  ('one-size', 'One Size', 90),
  ('accessories-size', 'Accessories Size', 100),
  ('jewelry-size', 'Jewelry Size', 110),
  ('custom-only', 'Custom Only', 120)
on conflict (key) do update set name = excluded.name, sort_order = excluded.sort_order;

with size_values as (
  select ov.id, ov.label
  from public.option_values ov
  join public.option_types ot on ot.id = ov.option_type_id
  where ot.key = 'size' and ot.brand_id is null
), assignments(profile_key, label, sort_order) as (
  values
    ('standard-apparel','XXS',1),('standard-apparel','XS',2),('standard-apparel','S',3),
    ('standard-apparel','M',4),('standard-apparel','L',5),('standard-apparel','XL',6),
    ('standard-apparel','XXL',7),('extended-apparel','XXXS',1),('extended-apparel','XXXL',2),
    ('extended-apparel','4XL',3),('extended-apparel','5XL',4),('one-size','One Size',1)
)
insert into public.size_profile_values(size_profile_id, option_value_id, sort_order)
select sp.id, sv.id, a.sort_order
from assignments a join public.size_profiles sp on sp.key=a.profile_key join size_values sv on sv.label=a.label
on conflict do nothing;

insert into public.size_profile_values(size_profile_id, option_value_id, sort_order)
select sp.id, ov.id, ov.sort_order
from public.size_profiles sp
join public.option_types ot on ot.key='size' and ot.brand_id is null
join public.option_values ov on ov.option_type_id=ot.id
where
  (sp.key='eu-shoes' and ov.label like 'EU %') or
  (sp.key='baby-age' and (ov.label='Newborn' or ov.label like '%Months' or ov.label like '%Years')) or
  (sp.key='kids-numeric' and ov.label ~ '^[2-9]$|^1[0-6]$') or
  (sp.key='waist-numeric' and ov.label ~ '^(2[4-9]|[3-5][0-9])$')
on conflict do nothing;

-- Product Type is the strongest signal; parent groups and main categories
-- are deliberately also assignable and resolved only as fallbacks.
insert into public.taxonomy_size_profiles(taxonomy_node_id, size_profile_id, priority)
select t.id, sp.id, case t.level when 3 then 300 when 2 then 200 else 100 end
from public.taxonomy_nodes t
join public.size_profiles sp on
  (sp.key='eu-shoes' and (lower(t.name) like '%shoe%' or lower(t.name) like '%sneaker%' or lower(t.name) like '%footwear%')) or
  (sp.key='baby-age' and (lower(t.name) like '%baby%' or lower(t.name) like '%bodysuit%')) or
  (sp.key='waist-numeric' and (lower(t.name) like '%trouser%' or lower(t.name) like '%pants%' or lower(t.name) like '%jeans%')) or
  (sp.key='jewelry-size' and lower(t.name) like '%ring%') or
  (sp.key='standard-apparel' and (lower(t.name) like '%clothing%' or lower(t.name) like '%top%' or lower(t.name) like '%shirt%' or lower(t.name) like '%trouser%'))
on conflict do nothing;

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  storage_reference text not null,
  display_order integer not null default 0 check (display_order >= 0),
  is_cover boolean not null default false,
  color_option_value_id uuid references public.option_values(id) on delete restrict,
  alt_text text not null default '',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, storage_reference),
  unique(product_id, display_order)
);
create unique index if not exists product_media_one_cover
  on public.product_media(product_id) where is_cover and not is_archived;
create unique index if not exists product_media_one_primary_color
  on public.product_media(product_id, color_option_value_id)
  where color_option_value_id is not null and not is_archived;
create index if not exists product_media_product_order
  on public.product_media(product_id, display_order);

-- Backfill cover first, then existing gallery order, then color images not
-- already represented by the exact same stable URL. No storage object is copied.
insert into public.product_media(product_id, storage_reference, display_order, is_cover, alt_text)
select p.id, p.image, 0, true, p.name
from public.products p where nullif(p.image,'') is not null
on conflict(product_id, storage_reference) do update set is_cover=true;

insert into public.product_media(product_id, storage_reference, display_order, alt_text)
select p.id, image_url,
  row_number() over(partition by p.id order by ord)::integer,
  p.name
from public.products p
cross join lateral unnest(coalesce(p.images, array[]::text[])) with ordinality as gallery(image_url, ord)
where nullif(image_url,'') is not null and image_url is distinct from p.image
on conflict(product_id, storage_reference) do nothing;

insert into public.product_media(product_id, storage_reference, display_order, color_option_value_id, alt_text)
select pci.product_id, pci.image_url,
  coalesce((select max(pm.display_order)+1 from public.product_media pm where pm.product_id=pci.product_id),0)
    + row_number() over(partition by pci.product_id order by pci.created_at)::integer - 1,
  pci.option_value_id, p.name
from public.product_color_images pci join public.products p on p.id=pci.product_id
on conflict(product_id, storage_reference) do update set color_option_value_id=excluded.color_option_value_id;

alter table public.product_media enable row level security;
create policy "Public reads media for published products" on public.product_media for select
using (exists(select 1 from public.products p where p.id=product_id and p.status='published'));
create policy "Brand members read own product media" on public.product_media for select to authenticated
using (exists(
  select 1 from public.products p join public.brand_staff bs on bs.brand_id=p.brand_id
  where p.id=product_id and bs.user_id=auth.uid()
));

-- Private reusable values are visible to their owner/admin, while public
-- storefront rendering can still resolve a value used by a published product.
drop policy if exists "Public can read option types" on public.option_types;
drop policy if exists "Public can read option values" on public.option_values;
create policy "Scoped option type reads" on public.option_types for select using (
  brand_id is null
  or exists(select 1 from public.brand_staff bs where bs.brand_id=option_types.brand_id and bs.user_id=auth.uid())
  or exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.is_admin)
  or exists(select 1 from public.product_options po join public.products p on p.id=po.product_id where po.option_type_id=option_types.id and p.status='published')
);
create policy "Scoped option value reads" on public.option_values for select using (
  brand_id is null
  or exists(select 1 from public.brand_staff bs where bs.brand_id=option_values.brand_id and bs.user_id=auth.uid())
  or exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.is_admin)
  or exists(
    select 1 from public.product_variant_values pvv
    join public.product_variants pv on pv.id=pvv.variant_id
    join public.products p on p.id=pv.product_id
    where pvv.option_value_id=option_values.id and p.status='published'
  )
);
