-- Additive fields already consumed by lib/data/brands.ts and the brand admin.
-- Safe to run repeatedly; no rows are deleted or rewritten.
alter table public.brands add column if not exists logo_image text;
alter table public.brands add column if not exists website_url text;
alter table public.brands add column if not exists story_image_2 text;
alter table public.brands add column if not exists shop_the_look jsonb not null default '[]'::jsonb;

comment on column public.brands.logo_image is 'Public URL or local public/ asset path for the brand logo.';
comment on column public.brands.shop_the_look is 'Editorial tiles shaped as [{image,title,href}].';
