# Mahaly (formerly LOCAL) — Project Context for Claude Code

This file is auto-loaded by Claude Code at the start of every session in this
repo. It exists so a new session has the same context as our full build
history, without needing it re-explained.

## What this project is

**Mahaly** (renamed from "Local" in Round 5) is a premium marketplace
connecting customers with independent local (Egyptian) brands — fashion,
beauty, accessories, home. Think Zalando/Farfetch-style browsing, but every
brand is small and curated. The codebase, folder names, and some internal
identifiers still say "Local" in places — only user-facing text and the
brand color were swept in the rename; that's an intentional scope boundary,
not something left unfinished.

Two visual "modes" coexist intentionally:
- **Main site** (homepage, `/shop/[category]`, `/product/[id]`, `/cart`, etc.)
  — cream/black/beige palette plus a dark red brand accent (`mahalyred` in
  `tailwind.config.ts`: `#B71F1A`, hover `#941713`, soft `#E8B8B2` — the
  owner's official palette values), `Header.tsx`/`Logo.tsx` with the Brands
  mega menu. The same drop also added `sand`/`blue.light`/`blue.grey`/
  `card`/`border`/`textmuted` tokens (the rest of that palette) — available
  now, not yet swept across the whole site (see "Not done yet").
- **Brand pages** (`/brands`, `/brands/[slug]`) — a separate navy/red/white
  editorial palette (see `tailwind.config.ts`: `navy`, `accentred`,
  `charcoal`, `muted`, `hairline` vs. the main site's `ink`, `cream`,
  `beige`, `stone`, `mahalyred`). **Do not merge these palettes** — this was
  a deliberate choice from two different design briefs, not an
  inconsistency to fix. `mahalyred` and `accentred` are two different reds
  on purpose — close in hue, but separate tokens; never point one at the
  other. `Header.tsx`/`Footer.tsx` (main site) ARE reused on brand pages
  though — only the content palette below the header differs, so brand
  pages do show the new red in that shared chrome.

## Tech stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS ·
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
- `PATCH /api/admin/users/[id]` has exactly one branch (`body.access`),
  gated by `requireStaffRole("admin")`. Two older branches
  (`body.isAdmin` boolean, bare `body.role` string) were removed after a
  security audit found the `isAdmin` one was only gated by
  `requireAdminUser()` — which accepts *any* rank, including "staff" — so
  a staff-rank account could grant or revoke admin access on arbitrary
  accounts. **Never re-add a body-shape branch to this route without an
  explicit `requireStaffRole("admin")` check of its own** — every access
  change belongs behind the same admin-rank gate.
- `POST/DELETE /api/admin/products/images` verify the caller's brand
  actually owns the target product (`canAccessFolder()`) before touching
  Storage — a brand owner could previously overwrite or delete another
  brand's images by guessing/knowing its product id. A brand-new product
  (no DB row yet, still using a client-generated temp folder id) is
  allowed through since there's nothing to check ownership against yet.
- `lib/csv.ts`'s `toCsv()` prefixes any cell starting with `=`/`+`/`-`/`@`
  with an apostrophe — CSV/Formula Injection mitigation, since order
  exports include customer-typed fields (shipping name/city) that get
  opened in Excel by admins. Don't remove this even if it looks like dead
  code — the exploit only surfaces once someone actually opens the file.
- `lib/discord.ts`'s webhook payload always sends
  `allowed_mentions: { parse: [] }` — embeds carry customer/applicant
  text verbatim (shipping name, brand application fields), so without
  this a value like "@everyone" would ping the whole Discord server.
- `lib/rateLimit.ts` — a plain in-memory limiter (per-instance, resets on
  cold start; not distributed) applied to the two public unauthenticated
  write routes: `/api/coupons/validate` (20/5min per IP) and
  `/api/join/apply` (5/hour per IP). Good enough for this project's size;
  revisit with Upstash/Redis only if it needs to hold across many
  serverless instances.
- `next.config.js` sets baseline security headers (CSP, X-Frame-Options,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS). The
  CSP's `script-src`/`style-src` intentionally still allow
  `unsafe-inline`/`unsafe-eval` (Next.js hydration + dev HMR need them) —
  its real value is restricting which *external* origins can load at
  all, not a fully locked-down policy. Update the CSP's `img-src`/
  `font-src`/`connect-src` allowlists here if a new external host
  (images, fonts, APIs) is ever added elsewhere in the app.
- **Next.js 16 / React 19** — upgraded from 14.2.35 (which had several
  disclosed CVEs per `npm audit`). Every dynamic route/page now uses the
  async `params`/`searchParams` API, and `createSupabaseServerClient()`
  is itself `async` (awaits `cookies()`, which is a Promise as of Next
  15+) — any new Server Component or Route Handler must `await` both.
  `middleware.ts` is now `proxy.ts` (Next 16 renamed the convention;
  same `export async function proxy(...)` shape). `next lint` no longer
  exists — linting runs `eslint .` directly against `eslint.config.mjs`
  (flat config, built from `eslint-config-next/core-web-vitals`).
  **Local dev runs `next dev --webpack`, not the Turbopack default** —
  Turbopack's dev server hits an environment-specific native SWC binding
  crash on this machine (`_swc.getBindingsSync is not a function`) that
  does not reproduce in `next build` (which already uses Turbopack
  successfully, and is what Vercel actually runs) — keep `--webpack` on
  the `dev` script unless that's independently confirmed fixed upstream.
- `/brands/[slug]`'s ISR caching (lost right after the Next 16 upgrade,
  since `requireUser()`/`requireBrandOwner()` reading `cookies()`
  unconditionally opts the *whole* route out of static generation under
  Next 15+) is fixed: the Follow-button/owner-check now lives in
  `components/brand/BrandHeroActions.tsx`, a client island that fetches
  its own state from `GET /api/brands/[slug]/viewer-status` on mount,
  instead of the page resolving it server-side. `BrandHero` itself takes
  only `brand` as a prop now. **Any future per-viewer bit added to a
  static/ISR page should follow this same pattern** (a small client
  component + its own API route) rather than reading `cookies()` in the
  page component directly, which would silently make the whole route
  dynamic again.

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
- Redesigned public brand pages (`/brands/[slug]`, now a thin redirect to
  `/brands/[slug]/products` with `/about`/`/collections`/`/reviews`
  siblings) — real Follow and a real product filter/sort (shared with
  `/shop/[category]` via `useProductFilters`). The original single-page
  redesign also had a stats band, Shop-the-Look, and brand-scoped Best
  Sellers; those components (`BrandStatsBand`, `ShopTheLook`,
  `BrandBestSellers`) stopped being referenced once the page split into
  sub-routes and were removed as dead code on 2026-08-05 — they are **not
  currently live**. Re-adding any of them to the new route structure is
  open work, not a revert.
- Role-gated cross-navigation: admin ↔ brand-portal ↔ account, each link
  only visible to accounts with the matching role/ownership.
- **Instant-Publish**: a brand owner/assistant's product
  create/edit/archive applies live immediately, with **no pre-approval
  gate** — the admin gets a plain notification (via the bell and
  `/admin/products/review`, "Brand Activity") describing exactly what
  happened, sourced from the same field-level diff (`lib/auditDiff.ts`)
  the Discord embeds use. There is **no Approve/Revert workflow** — that
  existed briefly and was removed on purpose (2026-08-07): admin can read
  what a brand did, not undo it from a notification. `audit_logs.before_value`/
  `after_value` still exist for the Audit Log page's own history view, just
  not wired to any revert action. **Do not reintroduce a pending-review
  gate, nor an Approve/Revert action, for brand-initiated product
  writes** — both were deliberately removed.
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

- **Homepage redesign + Mahaly rebrand (Round 5)** — logo + `mahalyred`
  accent in Header/Footer; Hero rebuilt from 3 rotated tiles to 4 equal
  tiles (Women/Men/Kids/Home, the last pointing at a static `/shop/home`
  "coming soon" page — no real Home category exists yet); a homepage
  "New Arrivals" product grid using `CompactProductCard` (deliberately no
  Add to Cart/wishlist — that only exists on `/product/[id]`); "Shop by
  Mood" (5 named lifestyle tiles, replacing the old 9-tile "Explore
  boards"); `Sponsored.tsx` rebuilt into a real 2-column Featured
  Brand/Sponsored-brands layout (`getBrandContent`/`getBrandSummariesBySlug`,
  never fabricated brand data). All 4 of these are **new `site_content`
  keys** (`home_hero_tiles`, `home_new_arrivals`, `shop_by_mood`,
  `featured_brand_and_sponsored`) with their own `/admin/content/*` pages —
  `home_new_arrivals`'s `source` field is exactly how the owner swaps
  "New Arrivals" for "Trending"/"Best Sellers" without touching code.

- **Sitewide `mahalyred` sweep (2026-08-07)** — every primary CTA button
  across `/shop/[category]`, `/product/[id]`, `/cart`, `/checkout`,
  `/account`, `/join-as-a-brand`, and `/admin` now uses `bg-mahalyred`
  instead of the old `bg-ink`. Selection-state indicators (chosen
  size/color swatches, checked filters, active tabs, sold-out badges,
  tooltips) were deliberately left `ink`/black on purpose — the red is
  reserved for actual primary actions, not every dark-colored element.
  The old customer "Appearance" page (3 light color-scheme picker:
  warm_sand/soft_rose/olive_stone, `profiles.notification_preferences.
  accountTheme`) was removed entirely — the account no longer has a
  visual theme picker of its own. **A sitewide dark mode was briefly
  built the same day and then fully reverted at the owner's request
  (2026-08-07)** — the color tokens in `tailwind.config.ts` are plain
  hex values again, not CSS custom properties; don't reintroduce a
  `.dark` toggle or a per-user color picker without being asked.

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

## Design skill routing

- Admin Dashboard, Brand Portal, inventory, warehouse, tables, filters, and dense operational workflows: use `ui-ux-pro-max` first, then `mahaly-web-design-guidelines` for the final accessibility and interface-quality review.
- Storefront, brand, editorial, landing, and marketing pages: use `design-taste-frontend`. Do not use it as the primary skill for dashboards or data tables.
- Motion work: use the narrowly matched Emil Kowalski skill (`animate`, `find-animation-opportunities`, `improve-animations`, or `review-animations`) and keep frequent operational actions fast and restrained.
- Use `transitions-dev` only for a specific documented micro-transition after its UX purpose is clear. Choose the smallest fitting pattern, preserve reduced-motion support, and do not run project-wide review/refine commands unless requested.
- Use `impeccable` for explicit critique, shaping, polish, hardening, adaptation, or broad redesign work. For Admin Dashboard and Brand Portal work select its **Operate** mode and keep `ui-ux-pro-max` and Mahaly's existing visual system as the primary constraints. Its Live, Hooks, Doctor, Pin, context, concept-seed, and image-generation scripts are opt-in and must not run without an explicit request and a bounded target.
- Use `brandkit` only for brand identity, logo-system, brand-guidelines-board, or visual-world image generation, not for general dashboard/product UI.
- These skills are advisory. User instructions, Mahaly's existing design system, the platform-wide consistency rule, permissions, and documented product decisions override them. Do not reintroduce dark mode or replace established tokens merely because a skill recommends a different default.
- Audited sources, pinned commits, and the Windows Python fallback for `ui-ux-pro-max` are documented in `docs/agent-skills.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
