# Local — Marketplace Landing Page

Premium, minimal landing page for **Local**, a marketplace connecting customers with independent local brands. Built with Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion, and Lucide icons.

## تشغيل المشروع محلياً

```bash
# 1) فك الضغط ثم ادخل المجلد
cd local-marketplace

# 2) نصّب المكتبات
npm install

# 3) شغّل السيرفر المحلي
npm run dev

# 4) افتح المتصفح على
http://localhost:3000
```

## Build for production

```bash
npm run build
npm run start
```

## Project structure

```
local-marketplace/
├── app/
│   ├── layout.tsx      # Root layout, fonts, metadata
│   ├── page.tsx         # Assembles all sections
│   └── globals.css      # Tailwind base + Inter font
├── components/
│   ├── Header.tsx        # Sticky nav, search, wishlist, cart
│   ├── Hero.tsx           # Split hero + rotated department cards
│   ├── ExploreBoards.tsx  # Pinterest-style horizontal gallery
│   ├── Sponsored.tsx      # Featured brand campaign section
│   └── Footer.tsx         # Zalando-style multi-column footer
├── tailwind.config.ts    # Design tokens (colors, radius, shadows)
└── next.config.js         # Unsplash remote image support
```

## Connecting to Supabase (real database)

The product and brand catalog now lives in Supabase instead of static files.

1. Create a project at [supabase.com](https://supabase.com) (or use an existing one).
2. In the Supabase SQL Editor, run `supabase/schema.sql` once to create all tables, indexes, and Row Level Security policies.
3. Copy `.env.local.example` to `.env.local` and fill in your project's URL and anon/publishable key (Settings → API).
4. Seed the starter catalog by running, from your terminal (never in a browser):
   ```bash
   SUPABASE_URL=https://your-project.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
   node scripts/seed.mjs
   ```
   The `service_role` key is only used here, locally, to bypass Row Level Security for the initial insert. It must never be committed or used in client-side code.
5. On Vercel, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` under Project Settings → Environment Variables, then redeploy.

Pages that read the catalog (`/shop/[category]`, `/product/[id]`, `/brands`, `/brands/[slug]`, `/search`) now fetch live from Supabase and revalidate every 60 seconds, so catalog edits in Supabase show up without a redeploy.

The Brands mega menu in the header still uses a small static list (`data/navigation.ts`) for instant, no-fetch navigation — update it manually when you add or remove a brand.

## Notes

- Images are pulled live from Unsplash — swap the URLs in each component with your own product photography whenever you're ready.
- Colors, radii, and shadows are all defined as design tokens in `tailwind.config.ts` — change them once, they cascade everywhere.
- All animations respect `prefers-reduced-motion`.
- Fully responsive down to mobile; the desktop layout in the brief is the `lg:` breakpoint and up.
