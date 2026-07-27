-- Replaces the flat, site_content-editable Category/Product Type picker
-- (content/productTaxonomy.ts's PRODUCT_TYPES_BY_CATEGORY, edited via
-- /admin/products/categories) with a real, recursive, DB-backed hierarchy
-- for the product form specifically: Main Category -> Product Group ->
-- Product Type. That old editor and its `product_taxonomy` site_content
-- key are left untouched — it still exists but no longer drives the
-- product form's Category/Product Type fields; Collections/Materials/Fits
-- there are unaffected.
--
-- Everything here is additive: a new table, a new nullable FK column on
-- products, and a data-only backfill for rows that already match by name.
-- The existing `products.product_category`/`product_type` text columns are
-- untouched and keep being written on every save (same
-- "document divergence, don't silently merge" precedent already used for
-- sales_channels/sales_channels_list etc in this schema) — every other
-- part of the app (shop filters, search, product cards, admin lists) reads
-- those text columns and needs zero changes.

-- ============================================================================
-- TAXONOMY_NODES — self-referencing tree, 3 levels deep
-- ============================================================================
create table if not exists taxonomy_nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references taxonomy_nodes (id) on delete cascade,
  level smallint not null check (level in (1, 2, 3)),
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Level 1 (Main Category) has no parent; levels 2/3 always do. Full
  -- "parent's level is exactly one less than mine" integrity is enforced by
  -- the trigger below (a plain CHECK can't reference another row).
  constraint taxonomy_nodes_root_parent_check
    check ((level = 1 and parent_id is null) or (level > 1 and parent_id is not null))
);

-- Siblings under the same parent can't share a slug; a partial index
-- separately covers the (parent_id is null) root level, since a plain
-- unique constraint treats every NULL as distinct and wouldn't catch two
-- Main Categories both slugged "clothing".
create unique index if not exists taxonomy_nodes_parent_slug_key
  on taxonomy_nodes (parent_id, slug) where parent_id is not null;
create unique index if not exists taxonomy_nodes_root_slug_key
  on taxonomy_nodes (slug) where parent_id is null;

create index if not exists idx_taxonomy_nodes_parent_id on taxonomy_nodes (parent_id);
create index if not exists idx_taxonomy_nodes_level on taxonomy_nodes (level);

create or replace function public.enforce_taxonomy_node_level()
returns trigger
language plpgsql
as $$
declare
  parent_level smallint;
begin
  if new.parent_id is null then
    return new;
  end if;
  select level into parent_level from taxonomy_nodes where id = new.parent_id;
  if parent_level is null then
    raise exception 'taxonomy_nodes: parent_id % does not exist', new.parent_id;
  end if;
  if parent_level <> new.level - 1 then
    raise exception 'taxonomy_nodes: a level % node must have a level % parent (got level %)',
      new.level, new.level - 1, parent_level;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_enforce_taxonomy_node_level on taxonomy_nodes;
create trigger trigger_enforce_taxonomy_node_level
  before insert or update of parent_id, level on taxonomy_nodes
  for each row execute function public.enforce_taxonomy_node_level();

create or replace function public.set_taxonomy_node_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_taxonomy_nodes_updated_at on taxonomy_nodes;
create trigger trigger_taxonomy_nodes_updated_at
  before update on taxonomy_nodes
  for each row execute function public.set_taxonomy_node_updated_at();

-- Publicly readable (the product form's cascading selects need this via
-- the anon key, same as products/brands elsewhere in this schema) — writes
-- go through the service_role key only, no public insert/update policy,
-- matching every other admin-managed table here.
alter table taxonomy_nodes enable row level security;
drop policy if exists "Taxonomy nodes are publicly readable" on taxonomy_nodes;
create policy "Taxonomy nodes are publicly readable"
  on taxonomy_nodes for select
  using (is_active = true);

-- ============================================================================
-- PRODUCTS — reference the resolved leaf only
-- ============================================================================
alter table products add column if not exists product_type_id uuid references taxonomy_nodes (id);
create index if not exists idx_products_product_type_id on products (product_type_id);

-- ============================================================================
-- SEED — initial Clothing taxonomy (Main Category -> 13 Product Groups ->
-- 75 Product Types). Idempotent: safe to run more than once.
-- ============================================================================
insert into taxonomy_nodes (parent_id, level, name, slug, sort_order)
values (null, 1, 'Clothing', 'clothing', 1)
on conflict (slug) where parent_id is null do nothing;

insert into taxonomy_nodes (parent_id, level, name, slug, sort_order)
select c.id, 2, v.name, v.slug, v.sort_order
from taxonomy_nodes c
join (values
  ('Tops', 'tops', 1),
  ('Bottoms', 'bottoms', 2),
  ('Dresses & One-Pieces', 'dresses-one-pieces', 3),
  ('Knitwear', 'knitwear', 4),
  ('Hoodies & Sweatshirts', 'hoodies-sweatshirts', 5),
  ('Outerwear', 'outerwear', 6),
  ('Suits & Tailoring', 'suits-tailoring', 7),
  ('Sets', 'sets', 8),
  ('Activewear', 'activewear', 9),
  ('Swimwear', 'swimwear', 10),
  ('Underwear', 'underwear', 11),
  ('Sleepwear & Loungewear', 'sleepwear-loungewear', 12),
  ('Traditional & Modest Wear', 'traditional-modest-wear', 13)
) as v(name, slug, sort_order) on true
where c.slug = 'clothing' and c.level = 1
on conflict (parent_id, slug) where parent_id is not null do nothing;

insert into taxonomy_nodes (parent_id, level, name, slug, sort_order)
select g.id, 3, v.name, v.slug, v.sort_order
from taxonomy_nodes g
join (values
  -- Tops
  ('tops', 'T-Shirts', 't-shirts', 1),
  ('tops', 'Shirts', 'shirts', 2),
  ('tops', 'Blouses', 'blouses', 3),
  ('tops', 'Polo Shirts', 'polo-shirts', 4),
  ('tops', 'Tank Tops', 'tank-tops', 5),
  ('tops', 'Crop Tops', 'crop-tops', 6),
  ('tops', 'Bodysuits', 'bodysuits', 7),
  ('tops', 'Tunics', 'tunics', 8),
  ('tops', 'Vests', 'vests', 9),
  -- Bottoms
  ('bottoms', 'Jeans', 'jeans', 1),
  ('bottoms', 'Trousers', 'trousers', 2),
  ('bottoms', 'Chinos', 'chinos', 3),
  ('bottoms', 'Cargo Pants', 'cargo-pants', 4),
  ('bottoms', 'Leggings', 'leggings', 5),
  ('bottoms', 'Joggers', 'joggers', 6),
  ('bottoms', 'Shorts', 'shorts', 7),
  ('bottoms', 'Skirts', 'skirts', 8),
  -- Dresses & One-Pieces
  ('dresses-one-pieces', 'Dresses', 'dresses', 1),
  ('dresses-one-pieces', 'Jumpsuits', 'jumpsuits', 2),
  ('dresses-one-pieces', 'Playsuits', 'playsuits', 3),
  ('dresses-one-pieces', 'Overalls', 'overalls', 4),
  -- Knitwear
  ('knitwear', 'Sweaters', 'sweaters', 1),
  ('knitwear', 'Cardigans', 'cardigans', 2),
  ('knitwear', 'Pullovers', 'pullovers', 3),
  ('knitwear', 'Knitted Dresses', 'knitted-dresses', 4),
  -- Hoodies & Sweatshirts
  ('hoodies-sweatshirts', 'Hoodies', 'hoodies', 1),
  ('hoodies-sweatshirts', 'Sweatshirts', 'sweatshirts', 2),
  ('hoodies-sweatshirts', 'Tracksuit Tops', 'tracksuit-tops', 3),
  -- Outerwear
  ('outerwear', 'Jackets', 'jackets', 1),
  ('outerwear', 'Blazers', 'blazers', 2),
  ('outerwear', 'Coats', 'coats', 3),
  ('outerwear', 'Trench Coats', 'trench-coats', 4),
  ('outerwear', 'Parkas', 'parkas', 5),
  ('outerwear', 'Gilets', 'gilets', 6),
  ('outerwear', 'Raincoats', 'raincoats', 7),
  -- Suits & Tailoring
  ('suits-tailoring', 'Suits', 'suits', 1),
  ('suits-tailoring', 'Suit Jackets', 'suit-jackets', 2),
  ('suits-tailoring', 'Suit Trousers', 'suit-trousers', 3),
  ('suits-tailoring', 'Waistcoats', 'waistcoats', 4),
  ('suits-tailoring', 'Tuxedos', 'tuxedos', 5),
  -- Sets
  ('sets', 'Two-Piece Sets', 'two-piece-sets', 1),
  ('sets', 'Three-Piece Sets', 'three-piece-sets', 2),
  ('sets', 'Co-ord Sets', 'co-ord-sets', 3),
  ('sets', 'Lounge Sets', 'lounge-sets', 4),
  -- Activewear
  ('activewear', 'Sports Tops', 'sports-tops', 1),
  ('activewear', 'Sports Bras', 'sports-bras', 2),
  ('activewear', 'Sports Leggings', 'sports-leggings', 3),
  ('activewear', 'Sports Shorts', 'sports-shorts', 4),
  ('activewear', 'Tracksuits', 'tracksuits', 5),
  ('activewear', 'Training Sets', 'training-sets', 6),
  -- Swimwear
  ('swimwear', 'Swimsuits', 'swimsuits', 1),
  ('swimwear', 'Bikinis', 'bikinis', 2),
  ('swimwear', 'Swim Shorts', 'swim-shorts', 3),
  ('swimwear', 'Rash Guards', 'rash-guards', 4),
  ('swimwear', 'Cover-Ups', 'cover-ups', 5),
  ('swimwear', 'Burkinis', 'burkinis', 6),
  -- Underwear
  ('underwear', 'Bras', 'bras', 1),
  ('underwear', 'Briefs', 'briefs', 2),
  ('underwear', 'Boxers', 'boxers', 3),
  ('underwear', 'Underwear Sets', 'underwear-sets', 4),
  ('underwear', 'Shapewear', 'shapewear', 5),
  ('underwear', 'Thermal Underwear', 'thermal-underwear', 6),
  -- Sleepwear & Loungewear
  ('sleepwear-loungewear', 'Pajama Sets', 'pajama-sets', 1),
  ('sleepwear-loungewear', 'Nightdresses', 'nightdresses', 2),
  ('sleepwear-loungewear', 'Robes', 'robes', 3),
  ('sleepwear-loungewear', 'Lounge Tops', 'lounge-tops', 4),
  ('sleepwear-loungewear', 'Lounge Bottoms', 'lounge-bottoms', 5),
  ('sleepwear-loungewear', 'Lounge Sets', 'lounge-sets', 6),
  -- Traditional & Modest Wear
  ('traditional-modest-wear', 'Abayas', 'abayas', 1),
  ('traditional-modest-wear', 'Kaftans', 'kaftans', 2),
  ('traditional-modest-wear', 'Jalabiyas', 'jalabiyas', 3),
  ('traditional-modest-wear', 'Thobes', 'thobes', 4),
  ('traditional-modest-wear', 'Prayer Dresses', 'prayer-dresses', 5),
  ('traditional-modest-wear', 'Modest Dresses', 'modest-dresses', 6),
  ('traditional-modest-wear', 'Modest Sets', 'modest-sets', 7)
) as v(group_slug, name, slug, sort_order) on g.slug = v.group_slug and g.level = 2
on conflict (parent_id, slug) where parent_id is not null do nothing;

-- ============================================================================
-- BACKFILL — match existing Clothing products to a new leaf by exact
-- (case-insensitive) name, only where nothing is matched yet. Anything that
-- doesn't match (e.g. the old flat "Pants"/"Outerwear" product_type values,
-- or non-Clothing categories like Shoes/Bags not seeded yet) is left with
-- product_type_id null — those products keep working exactly as before via
-- the untouched product_category/product_type text columns.
-- ============================================================================
update products p
set product_type_id = t.id
from taxonomy_nodes t
join taxonomy_nodes g on g.id = t.parent_id and g.level = 2
join taxonomy_nodes c on c.id = g.parent_id and c.level = 1
where t.level = 3
  and p.product_type_id is null
  and p.product_category is not null
  and p.product_type is not null
  and lower(trim(p.product_category)) = lower(c.name)
  and lower(trim(p.product_type)) = lower(t.name);
