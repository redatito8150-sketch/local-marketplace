-- ============================================================================
-- Which option types/values a product actually uses (product_options /
-- product_option_values), which values compose each generated variant
-- (product_variant_values), and the per-product Color -> image mapping
-- (product_color_images).
-- ============================================================================

create table if not exists product_options (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,
  option_type_id uuid not null references option_types(id) on delete restrict,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, option_type_id)
);

create index if not exists idx_product_options_product_id on product_options (product_id);

-- Hard cap of 3 option types per product, enforced here (not just in the
-- UI/app layer) so it can never be bypassed by a direct write.
create or replace function public.enforce_max_3_product_options()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from product_options where product_id = new.product_id) >= 3 then
    raise exception 'A product can have a maximum of 3 variant options.';
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_enforce_max_3_product_options on product_options;
create trigger trigger_enforce_max_3_product_options
  before insert on product_options
  for each row execute function public.enforce_max_3_product_options();

create table if not exists product_option_values (
  id uuid primary key default gen_random_uuid(),
  product_option_id uuid not null references product_options(id) on delete cascade,
  option_value_id uuid not null references option_values(id) on delete restrict,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (product_option_id, option_value_id)
);

create index if not exists idx_product_option_values_product_option_id on product_option_values (product_option_id);

-- A selected value must belong to the same option_type as the product's
-- selection for that slot, and if it's a brand-private value, it must
-- belong to the SAME brand as the product itself — this is the DB-level
-- guard against a private value ever leaking into another brand's product,
-- mirroring the existing cross-brand collection guard pattern.
create or replace function public.enforce_option_value_matches_type_and_brand()
returns trigger
language plpgsql
as $$
declare
  v_option_type_id uuid;
  v_product_brand_id uuid;
  v_value_type_id uuid;
  v_value_brand_id uuid;
begin
  select po.option_type_id, p.brand_id into v_option_type_id, v_product_brand_id
  from product_options po
  join products p on p.id = po.product_id
  where po.id = new.product_option_id;

  select option_type_id, brand_id into v_value_type_id, v_value_brand_id
  from option_values where id = new.option_value_id;

  if v_value_type_id is null then
    raise exception 'option_value % does not exist', new.option_value_id;
  end if;
  if v_value_type_id is distinct from v_option_type_id then
    raise exception 'option_value % does not belong to the selected option type', new.option_value_id;
  end if;
  if v_value_brand_id is not null and v_value_brand_id is distinct from v_product_brand_id then
    raise exception 'option_value % belongs to a different brand', new.option_value_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_enforce_option_value_matches_type_and_brand on product_option_values;
create trigger trigger_enforce_option_value_matches_type_and_brand
  before insert or update on product_option_values
  for each row execute function public.enforce_option_value_matches_type_and_brand();

-- Same brand-ownership guard, reused for the option TYPE itself (a private
-- option type from brand A must never be attached to brand B's product).
create or replace function public.enforce_option_type_matches_brand()
returns trigger
language plpgsql
as $$
declare
  v_product_brand_id uuid;
  v_type_brand_id uuid;
begin
  select brand_id into v_product_brand_id from products where id = new.product_id;
  select brand_id into v_type_brand_id from option_types where id = new.option_type_id;

  if v_type_brand_id is not null and v_type_brand_id is distinct from v_product_brand_id then
    raise exception 'option_type % belongs to a different brand', new.option_type_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_enforce_option_type_matches_brand on product_options;
create trigger trigger_enforce_option_type_matches_brand
  before insert or update on product_options
  for each row execute function public.enforce_option_type_matches_brand();

-- ============================================================================
-- product_variant_values — which option values compose each variant.
-- ============================================================================
create table if not exists product_variant_values (
  variant_id uuid not null references product_variants(id) on delete cascade,
  option_value_id uuid not null references option_values(id) on delete restrict,
  primary key (variant_id, option_value_id)
);

create index if not exists idx_product_variant_values_option_value_id on product_variant_values (option_value_id);

-- ============================================================================
-- product_color_images — one optional mapped image per product Color
-- value, shared by every variant using that color (not repeated per Size).
-- ============================================================================
create table if not exists product_color_images (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,
  option_value_id uuid not null references option_values(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, option_value_id)
);

create index if not exists idx_product_color_images_product_id on product_color_images (product_id);

create or replace function public.enforce_color_image_is_color_option()
returns trigger
language plpgsql
as $$
declare
  v_key text;
begin
  select ot.key into v_key
  from option_values ov join option_types ot on ot.id = ov.option_type_id
  where ov.id = new.option_value_id;

  if v_key is distinct from 'color' then
    raise exception 'product_color_images.option_value_id must reference a Color option value';
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_enforce_color_image_is_color_option on product_color_images;
create trigger trigger_enforce_color_image_is_color_option
  before insert or update on product_color_images
  for each row execute function public.enforce_color_image_is_color_option();

create or replace function public.set_product_color_images_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_product_color_images_updated_at on product_color_images;
create trigger trigger_product_color_images_updated_at
  before update on product_color_images
  for each row execute function public.set_product_color_images_updated_at();

alter table product_options enable row level security;
alter table product_option_values enable row level security;
alter table product_variant_values enable row level security;
alter table product_color_images enable row level security;

-- Same convention as products/product_variants: public read (the
-- storefront needs these to render variant selection on published
-- products), no public write — every write goes through a service-role
-- route that verifies brand ownership first.
create policy "Public can read product options" on product_options for select using (true);
create policy "Public can read product option values" on product_option_values for select using (true);
create policy "Public can read product variant values" on product_variant_values for select using (true);
create policy "Public can read product color images" on product_color_images for select using (true);
