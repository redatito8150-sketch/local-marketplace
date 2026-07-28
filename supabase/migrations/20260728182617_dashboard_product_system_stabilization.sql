-- Dashboard and product system stabilization.
-- Forward-only and idempotent: repairs production schema drift without
-- changing existing option, variant, SKU, inventory, order, or brand ids.

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

-- Remove only legacy whole-table uniqueness constraints if they survived an
-- older manual deployment. Scoped partial indexes below are authoritative.
alter table public.option_types drop constraint if exists option_types_key_key;
alter table public.option_types drop constraint if exists option_types_name_key;
alter table public.option_values drop constraint if exists option_values_key_key;
alter table public.option_values drop constraint if exists option_values_label_key;

create unique index if not exists option_types_system_key_key
  on public.option_types (key) where brand_id is null;
create unique index if not exists option_types_brand_key_key
  on public.option_types (brand_id, key) where brand_id is not null;
create unique index if not exists option_values_system_key_key
  on public.option_values (option_type_id, key) where brand_id is null;
create unique index if not exists option_values_brand_key_key
  on public.option_values (option_type_id, brand_id, key) where brand_id is not null;

create or replace function public.enforce_option_type_not_reserved()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.brand_id is not null and lower(trim(new.key)) in ('color', 'size') then
    raise exception 'The option type name "%" is reserved', new.name
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_enforce_option_type_not_reserved on public.option_types;
create trigger trigger_enforce_option_type_not_reserved
  before insert or update on public.option_types
  for each row execute function public.enforce_option_type_not_reserved();

-- Restore the two authoritative system option types if a partial seed was
-- ever removed. Existing stable ids are retained.
insert into public.option_types (brand_id, name, key, is_system, sort_order)
values
  (null, 'Color', 'color', true, 1),
  (null, 'Size', 'size', true, 2)
on conflict (key) where brand_id is null
do update set
  name = excluded.name,
  is_system = true,
  is_archived = false,
  archived_at = null,
  sort_order = excluded.sort_order,
  updated_at = now();

with color_type as (
  select id from public.option_types where brand_id is null and key = 'color'
), seed(label, key, sku_token, swatch_type, primary_color, secondary_color, sort_order) as (
  values
    ('Black','black','BLACK','single','#000000',null,1),
    ('White','white','WHITE','single','#FFFFFF',null,2),
    ('Grey','grey','GREY','single','#808080',null,3),
    ('Navy','navy','NAVY','single','#1B2A4A',null,4),
    ('Beige','beige','BEIGE','single','#E8DCC8',null,5),
    ('Brown','brown','BROWN','single','#5B3A29',null,6),
    ('Red','red','RED','single','#C1272D',null,7),
    ('Green','green','GREEN','single','#2E5339',null,8),
    ('Blue','blue','BLUE','single','#2C5AA0',null,9),
    ('Yellow','yellow','YELLOW','single','#F0C929',null,10),
    ('Pink','pink','PINK','single','#E8A0BF',null,11),
    ('Orange','orange','ORANGE','single','#E0742B',null,12),
    ('Black & White','black-white','BLACKWHITE','split','#000000','#FFFFFF',13),
    ('Multicolor','multicolor','MULTICOLOR','multicolor',null,null,14)
)
insert into public.option_values (
  option_type_id, brand_id, label, key, sku_token, swatch_type,
  primary_color, secondary_color, sort_order
)
select color_type.id, null, seed.label, seed.key, seed.sku_token,
  seed.swatch_type, seed.primary_color, seed.secondary_color, seed.sort_order
from color_type cross join seed
on conflict (option_type_id, key) where brand_id is null
do update set
  label = excluded.label,
  sku_token = excluded.sku_token,
  swatch_type = excluded.swatch_type,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  is_archived = false,
  archived_at = null,
  sort_order = excluded.sort_order,
  updated_at = now();

with size_type as (
  select id from public.option_types where brand_id is null and key = 'size'
), seed(label, sort_order) as (
  values
    ('XXXS',1),('XXS',2),('XS',3),('S',4),('M',5),('L',6),
    ('XL',7),('XXL',8),('XXXL',9),('4XL',10),('5XL',11),
    ('One Size',20),
    ('24',30),('25',31),('26',32),('27',33),('28',34),('29',35),
    ('30',36),('31',37),('32',38),('33',39),('34',40),('35',41),
    ('36',42),('38',43),('40',44),('42',45),('44',46),('46',47),
    ('48',48),('50',49),('52',50),('54',51),
    ('2',60),('3',61),('4',62),('5',63),('6',64),('7',65),
    ('8',66),('9',67),('10',68),('11',69),('12',70),('13',71),
    ('14',72),('15',73),('16',74),
    ('Newborn',80),('0–3 Months',81),('3–6 Months',82),('6–9 Months',83),
    ('9–12 Months',84),('12–18 Months',85),('18–24 Months',86),
    ('2–3 Years',87),('3–4 Years',88),('4–5 Years',89),('5–6 Years',90),
    ('6–7 Years',91),('7–8 Years',92),('8–9 Years',93),('9–10 Years',94),
    ('10–11 Years',95),('11–12 Years',96),('12–13 Years',97),
    ('13–14 Years',98),('14–15 Years',99),('15–16 Years',100),
    ('EU 16',110),('EU 17',111),('EU 18',112),('EU 19',113),('EU 20',114),
    ('EU 21',115),('EU 22',116),('EU 23',117),('EU 24',118),('EU 25',119),
    ('EU 26',120),('EU 27',121),('EU 28',122),('EU 29',123),('EU 30',124),
    ('EU 31',125),('EU 32',126),('EU 33',127),('EU 34',128),('EU 35',129),
    ('EU 36',130),('EU 37',131),('EU 38',132),('EU 39',133),('EU 40',134),
    ('EU 41',135),('EU 42',136),('EU 43',137),('EU 44',138),('EU 45',139),
    ('EU 46',140),('EU 47',141),('EU 48',142),('EU 49',143),('EU 50',144)
), normalized as (
  select
    label,
    trim(both '-' from lower(regexp_replace(label, '[^a-zA-Z0-9]+', '-', 'g'))) as key,
    upper(left(regexp_replace(label, '[^a-zA-Z0-9]', '', 'g'), 10)) as sku_token,
    sort_order
  from seed
)
insert into public.option_values (
  option_type_id, brand_id, label, key, sku_token, sort_order
)
select size_type.id, null, normalized.label, normalized.key,
  normalized.sku_token, normalized.sort_order
from size_type cross join normalized
on conflict (option_type_id, key) where brand_id is null
do update set
  label = excluded.label,
  sku_token = excluded.sku_token,
  is_archived = false,
  archived_at = null,
  sort_order = excluded.sort_order,
  updated_at = now();

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

drop policy if exists "Size profiles are publicly readable" on public.size_profiles;
drop policy if exists "Size profile values are publicly readable" on public.size_profile_values;
drop policy if exists "Taxonomy size profiles are publicly readable" on public.taxonomy_size_profiles;
create policy "Size profiles are publicly readable"
  on public.size_profiles for select using (true);
create policy "Size profile values are publicly readable"
  on public.size_profile_values for select using (true);
create policy "Taxonomy size profiles are publicly readable"
  on public.taxonomy_size_profiles for select using (true);

grant select on public.size_profiles, public.size_profile_values,
  public.taxonomy_size_profiles to anon, authenticated;

insert into public.size_profiles (key, name, sort_order) values
  ('standard-apparel','Standard Apparel',10),
  ('extended-apparel','Extended Apparel',20),
  ('alpha-kids','Alpha Kids',30),
  ('baby-age','Baby Age',40),
  ('kids-numeric','Kids Numeric',50),
  ('waist-numeric','Waist Numeric',60),
  ('trousers-waist-inseam','Trousers Waist and Inseam',70),
  ('eu-shoes','EU Shoes',80),
  ('one-size','One Size',90),
  ('accessories-size','Accessories Size',100),
  ('jewelry-size','Jewelry Size',110),
  ('custom-only','Custom Only',120)
on conflict (key) do update
set name = excluded.name, sort_order = excluded.sort_order;

with size_values as (
  select ov.id, ov.label, ov.sort_order
  from public.option_values ov
  join public.option_types ot on ot.id = ov.option_type_id
  where ot.brand_id is null and ot.key = 'size'
)
insert into public.size_profile_values (size_profile_id, option_value_id, sort_order)
select sp.id, sv.id, sv.sort_order
from public.size_profiles sp
join size_values sv on
  (sp.key = 'eu-shoes' and sv.label like 'EU %') or
  (sp.key = 'baby-age' and (sv.label = 'Newborn' or sv.label like '%Months' or sv.label like '%Years')) or
  (sp.key = 'kids-numeric' and sv.label ~ '^[2-9]$|^1[0-6]$') or
  (sp.key = 'waist-numeric' and sv.label ~ '^(2[4-9]|[3-5][0-9])$') or
  (sp.key = 'one-size' and sv.label = 'One Size') or
  (sp.key = 'standard-apparel' and sv.label in ('XXS','XS','S','M','L','XL','XXL')) or
  (sp.key = 'extended-apparel' and sv.label in ('XXXS','XXXL','4XL','5XL'))
on conflict do nothing;

insert into public.taxonomy_size_profiles (taxonomy_node_id, size_profile_id, priority)
select t.id, sp.id, case t.level when 3 then 300 when 2 then 200 else 100 end
from public.taxonomy_nodes t
join public.size_profiles sp on
  (sp.key = 'eu-shoes' and (lower(t.name) like '%shoe%' or lower(t.name) like '%sneaker%' or lower(t.name) like '%footwear%')) or
  (sp.key = 'baby-age' and (lower(t.name) like '%baby%' or lower(t.name) like '%bodysuit%')) or
  (sp.key = 'waist-numeric' and (lower(t.name) like '%trouser%' or lower(t.name) like '%pants%' or lower(t.name) like '%jeans%')) or
  (sp.key = 'jewelry-size' and lower(t.name) like '%ring%') or
  (sp.key = 'standard-apparel' and (lower(t.name) like '%clothing%' or lower(t.name) like '%top%' or lower(t.name) like '%shirt%'))
on conflict do nothing;

-- Owners and staff can read their own private reusable data; published
-- products remain resolvable by the storefront. Writes still go through
-- service-role routes with explicit ownership checks.
drop policy if exists "Public can read option types" on public.option_types;
drop policy if exists "Public can read option values" on public.option_values;
drop policy if exists "Scoped option type reads" on public.option_types;
drop policy if exists "Scoped option value reads" on public.option_values;

create policy "Scoped option type reads" on public.option_types for select
using (
  brand_id is null
  or exists (
    select 1 from public.brands b
    where b.id = option_types.brand_id and b.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.brand_staff bs
    where bs.brand_id = option_types.brand_id and bs.user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.profiles pr
    where pr.id = (select auth.uid()) and pr.is_admin
  )
  or exists (
    select 1 from public.product_options po
    join public.products p on p.id = po.product_id
    where po.option_type_id = option_types.id and p.status = 'published'
  )
);

create policy "Scoped option value reads" on public.option_values for select
using (
  brand_id is null
  or exists (
    select 1 from public.brands b
    where b.id = option_values.brand_id and b.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.brand_staff bs
    where bs.brand_id = option_values.brand_id and bs.user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.profiles pr
    where pr.id = (select auth.uid()) and pr.is_admin
  )
  or exists (
    select 1 from public.product_variant_values pvv
    join public.product_variants pv on pv.id = pvv.variant_id
    join public.products p on p.id = pv.product_id
    where pvv.option_value_id = option_values.id and p.status = 'published'
  )
);

grant select on public.option_types, public.option_values to anon, authenticated;

-- Repair legacy conversions where the application retained the brand slug
-- but converted_brand_id/owner_user_id were never linked. Only an unowned
-- brand and an explicit converted application are eligible.
update public.brands b
set
  owner_user_id = ba.applicant_user_id,
  source_application_id = coalesce(b.source_application_id, ba.id)
from public.brand_applications ba
where b.owner_user_id is null
  and ba.applicant_user_id is not null
  and ba.status = 'converted_to_brand'
  and (
    ba.converted_brand_id = b.id
    or ba.approved_brand_id = b.slug
  )
  and not exists (
    select 1 from public.brands existing
    where existing.owner_user_id = ba.applicant_user_id
      and existing.id <> b.id
  );
