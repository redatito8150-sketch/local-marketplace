# LOCAL — Project Context for Claude Code

This file is auto-loaded by Claude Code at the start of every session in this
repo. It exists so a new session has the same context as our full build
history, without needing it re-explained.

## What this project is

**LOCAL** is a premium marketplace connecting customers with independent
local (Egyptian) brands — fashion, beauty, accessories, home. Think
Zalando/Farfetch-style browsing, but every brand is small and curated.

Two visual "modes" coexist intentionally:
- **Main site** (homepage, `/shop/[category]`, `/product/[id]`, `/cart`, etc.)
  — cream/black/beige palette, `Header.tsx` with the Brands mega menu.
- **Brand pages** (`/brands`, `/brands/[slug]`) — a separate navy/red/white
  editorial palette (see `tailwind.config.ts`: `navy`, `accentred`,
  `charcoal`, `muted`, `hairline` vs. the main site's `ink`, `cream`,
  `beige`, `stone`). **Do not merge these palettes** — this was a deliberate
  choice from two different design briefs, not an inconsistency to fix.
  `Header.tsx`/`Footer.tsx` (main site) ARE reused on brand pages though —
  only the content palette below the header differs.

## Tech stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS ·
Framer Motion · Lucide icons · Supabase (Postgres + Auth, live).

## Architecture — read this before adding data or content

- **`content/`** — STATIC editorial/marketing copy that ships with the
  code (category hero text, mega menu items, journal articles). Edit code,
  redeploy.
- **`lib/data/`** — DYNAMIC data layer, reads live from Supabase
  (`products.ts`, `brands.ts`). Edit Supabase, no redeploy needed.
  These two folders look similar on purpose — the split is intentional,
  don't consolidate them.
- **`types/index.ts`** — every shared TypeScript type lives here in one
  file (including `CartLineItem`/`WishlistItem`, which are re-exported
  from their context files for convenience). Don't redefine types locally
  in components.
- **`components/shared/`** — cross-cutting UI (`StarRating.tsx`). If you
  find yourself duplicating price formatting or star rendering again,
  it belongs here or in `lib/format.ts`, not inline.
- **`context/`** — `CartContext` and `WishlistContext`, both persist to
  `localStorage` (not yet tied to a user account — see Roadmap).

## Supabase

- Schema: `supabase/schema.sql` — run once in the Supabase SQL editor.
  Covers `products`, `brands`, `orders`, `order_items`, `profiles`, with
  RLS enabled. **No public INSERT policies exist on purpose** — writes go
  through the service_role key server-side only, never the browser anon key.
- Seed script: `scripts/seed.mjs` — run locally with
  `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars to populate the
  starter catalog. Never commit the service_role key anywhere.
- Client: `lib/supabase/client.ts` uses only the public anon key
  (`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`), safe for
  both server and client components.
- `.env.local` is gitignored and NOT included when this project is shared
  as a zip — copy `.env.local.example` and fill in real values locally,
  and set the same two `NEXT_PUBLIC_` vars in Vercel → Settings →
  Environment Variables.
- `DISCORD_WEBHOOK_NOTIFICATIONS`/`_AUDIT_LOG`/`_ERRORS` (optional) —
  per-channel Discord webhook URLs for the log-mirroring system above.
  Server-only, never `NEXT_PUBLIC_`. Leave unset locally and everything
  still works — `sendToDiscord()` just no-ops for whichever channel has
  no URL configured.

## Security notes already handled

- Search (`lib/data/products.ts` → `searchProducts`) uses parameterized
  `.ilike()` calls, not string-interpolated `.or()` filters — this was a
  real filter-injection vector that got fixed, don't revert to the
  interpolated pattern.
- `app/error.tsx` + `app/global-error.tsx` exist as error boundaries.
  The data-layer functions in `lib/data/` deliberately `throw` on real
  Supabase errors (so the boundary catches them) but return `null`/`[]`
  for legitimate "not found" or "empty" states — keep that distinction
  when adding new data functions.
- Watch for React's `react/no-unescaped-entities` ESLint rule — plain
  apostrophes (`'`) in JSX text (e.g. "couldn't", "you're") fail
  production builds. Use `&apos;` in JSX text nodes.

## Current status (what's built vs. not)

**Done:**
- Full storefront: browsing, cart, wishlist, live search with autocomplete,
  working filters (brand/price/size/color/availability/rating) on
  `/shop/[category]`, mega menu, journal, error boundaries.
- **Supabase Auth** (customer accounts) + **real order persistence** —
  checkout writes through a server-side API route with the service_role
  key; `orders`/`order_items` are real, not just UI.
- **Admin dashboard** (`/admin`) — products, brands, orders, users,
  coupons, revenue analytics, homepage/journal CMS (`site_content`),
  audit log, notification bell.
- **Brand-owner portal** (`/brand-portal`) — `brand_owner`/`brand_assistant`
  roles (`brands.owner_user_id` / `brand_staff` table), own-brand product
  management, brand page content editor, stock/orders/logs views.
- **Full account dashboard** (`/account/*`) — Overview, Orders (status
  tabs), Wishlist (real per-account, not just localStorage), Addresses
  (full CRUD + checkout prefill), Settings (profile/password/delete),
  Notifications (preference toggles), Payment Methods (placeholder, no
  gateway yet), Recently Viewed, Followed Brands.
- Redesigned public brand pages (`/brands/[slug]`) — real Follow, stats
  band, Shop-the-Look, brand-scoped Best Sellers, a real product
  filter/sort (shared with `/shop/[category]` via `useProductFilters`).
- Role-gated cross-navigation: admin ↔ brand-portal ↔ account, each link
  only visible to accounts with the matching role/ownership.
- **Instant-Publish**: a brand owner/assistant's product
  create/edit/archive applies live immediately, with **no pre-approval
  gate** — the admin gets a resolvable notification (Approve/Revert,
  reusing `audit_logs.before_value`/`after_value` as the revert source)
  via the bell and `/admin/products/review` ("Brand Activity" feed).
  **Do not reintroduce a pending-review gate for brand-initiated product
  writes** — this replaced that model on purpose.
- **Discord log mirroring** — every `notify()`/`logAudit()` call, plus
  every pre-existing "log it, don't throw" error site, also posts a
  color-coded structured embed (green = added, orange = edited, red =
  removed) to one of 3 Discord webhook channels (`#notifications`,
  `#audit-log`, `#errors`) via `lib/discord.ts`/`lib/errorLog.ts`. The
  `notifications` table stays capped at the most recent 50 rows via a
  Postgres trigger (`prune_old_notifications`) — Discord is the permanent
  archive for anything older; `audit_logs` itself stays unbounded. Wiring
  a new write path into `notify()`/`logAudit()` gets Discord mirroring
  for free; no separate integration needed. Webhook URLs are optional
  env vars (`DISCORD_WEBHOOK_NOTIFICATIONS`/`_AUDIT_LOG`/`_ERRORS`) —
  everything no-ops silently if unset, never throws.

**Not done yet:**
1. **Payment gateway** — Paymob or Fawry (Egypt-first) or Stripe. Checkout
   UI and real order persistence already exist; no actual payment
   processing is wired in yet (orders are created without a live charge).

## Conventions to keep following

- Arabic/English mixed conversation history — code, comments, and commit
  messages are in English; explanations to the person are in Egyptian
  Arabic when that's the language they're using.
- Prefer editing the shared `lib/format.ts` / `components/shared/` over
  reintroducing per-component duplicates of price formatting or star
  ratings.
- Run `npm run build` locally before pushing — ESLint errors (like
  unescaped entities) fail production builds even when `next dev` looks fine.