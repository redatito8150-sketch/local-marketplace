# Men, Kids, and Home collections

## Fictional local brands

- **SAQR CAIRO** (`saqr-cairo`) — contemporary Egyptian menswear in warm stone, charcoal, olive, navy, and sand.
- **NABTA KIDS** (`nabta-kids`) — premium parent-friendly kidswear in cream, sky, peach, coral, yellow, and sage.

Both brands and all twelve products are fictional. They do not impersonate real companies.

## Asset layout

- Collection models: `public/images/collections/{men,kids}/hero-model.png`
- Brand logos and campaigns: `public/images/brands/{saqr-cairo,nabta-kids}/`
- Product catalog images: `public/images/products/<product-id>/main.webp`

The model assets were generated on a flat chroma background, converted locally to RGBA PNG, and validated for transparent corners and full-body coverage. Campaign and product assets are optimized WebP files. Images are stored in the repository; the database stores only public asset paths.

## Safe database setup

No production database write is performed by this feature.

1. Apply `supabase/migrations/20260721_collection_brand_content.sql` to a local, development, or preview Supabase project.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` locally. Never commit either value.
3. Run the seed with explicit safeguards:

   ```powershell
   $env:SEED_TARGET = "preview"
   $env:ALLOW_COLLECTION_SEED = "true"
   node scripts/seed-men-kids-collections.mjs
   ```

The seed refuses a target other than `local`, `development`, or `preview`. Brands and products use stable slugs/IDs; variants use deterministic UUIDs. Re-running the seed updates the same records rather than creating duplicates.

## Review note

Until the seed is applied to the environment being viewed, Men and Kids heroes safely fall back to the first five existing products in their real category data. After seeding, the configured SAQR and NABTA featured looks replace that fallback automatically.
