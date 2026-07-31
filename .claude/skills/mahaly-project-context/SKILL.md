---
name: mahaly-project-context
description: Fast orientation for the Mahaly marketplace repo — a one-call summary of the architecture, the admin/brand-portal/storefront split, the two visual palettes, Supabase/RLS conventions, and the current list of known-open security risks, with pointers to the full docs instead of re-deriving everything from scratch. Use this at the start of any work session on this repo before doing broad exploration (grepping around to "understand the codebase," asking "how does X work here," or starting a non-trivial feature/fix) — especially useful right after a context compaction/reset, or when picking this project back up after time away. Not a substitute for reading CLAUDE.md or the actual code before editing something specific — it's an index, not the source of truth.
---

# Mahaly Project Context

Mahaly is a premium multi-brand marketplace (Next.js 16 App Router,
TypeScript strict, Tailwind, Supabase Postgres/Auth/Storage). This skill
exists so a session doesn't have to re-read a dozen files just to get
oriented — it's a map, not the territory. **`CLAUDE.md` at the repo root
is still the canonical source** for anything this summary simplifies or
omits; read it in full before making an architectural decision, not just
this skill's compressed version of it.

## Orientation, fast

**Two data layers, don't merge them:**
- `content/` — static editorial copy shipped with the code (category
  hero text, mega menu, journal articles). Edit code, redeploy.
- `lib/data/` — dynamic, reads live from Supabase (`products.ts`,
  `brands.ts`). Edit Supabase, no redeploy needed.
- They look similar on purpose. This is a deliberate split from
  `CLAUDE.md`, not duplication to clean up.

**Three route worlds, cleanly separated:**
- Storefront (public) — `/`, `/shop/[category]`, `/product/[id]`,
  `/brands/[slug]`, `/cart`, `/checkout`, `/account/*`.
- `/admin` — staff/manager/admin-rank only, via `requireAdminUser()` /
  `requireStaffRole(rank)`. Full platform control: products, brands,
  orders, users, coupons, Page Studio (homepage CMS), audit log.
- `/brand-portal` — brand owner/assistant only, via `requireBrandOwner()`.
  Scoped strictly to the caller's own brand — every route double-checks
  ownership server-side, never trusts a client-sent `brandId`.

**Two visual palettes — never merge these, it's intentional:**
- Main site: cream/black/beige + `mahalyred` accent (`#B71F1A`).
- Brand pages (`/brands/*`): separate navy/red/white editorial palette
  (`navy`, `accentred`, `charcoal` vs. main site's `ink`, `cream`,
  `mahalyred`). `mahalyred` and `accentred` are two different reds on
  purpose. `Header.tsx`/`Footer.tsx` are shared across both, so brand
  pages do show `mahalyred` in that shared chrome — only the content
  palette below the header differs.
- A **sitewide `mahalyred` sweep** is explicitly not done yet — most
  non-homepage primary buttons still use the old `bg-ink` styling. This
  is deferred, not a bug.

**Supabase conventions:**
- `lib/supabase/client.ts` — anon key, safe for browser + server.
- `lib/supabase/admin.ts` (`supabaseAdmin`) — service-role key,
  **server-only**, used for every privileged write. Never expose it to a
  client component.
- RLS pattern for anything per-product/per-brand: scope `SELECT` to
  `status = 'published' and paused_by_brand = false` on the parent
  product, plus a `brand_staff`-authenticated bypass policy. This is the
  established pattern (`product_variants`, `product_media`, and — after
  the 2026-08-04 audit — `product_options`/`product_option_values`/
  `product_variant_values`/`product_color_images` all follow it). A new
  per-product child table should follow the same shape from day one.
- `supabase/schema.sql` is a **hand-maintained baseline, not
  auto-generated** — it can be stale relative to what the accumulated
  `supabase/migrations/*.sql` files actually produce live. Never trust
  `schema.sql` alone to know a policy's current state; check for a later
  migration that alters it.
- Every `SECURITY DEFINER` Postgres function in this repo pins
  `search_path` — keep that discipline for any new one.
- Error-response convention: never return a raw Supabase/Postgres
  `error.message` to an API client. Use `safeErrorResponse()` /
  `logError()` from `lib/apiError.ts` / `lib/errorLog.ts` — logs the real
  message server-side (mirrored to Discord), returns a stable generic
  message to the client. This is a hard-won convention (see the security
  docs below) — don't reintroduce the old pattern in a new route.

## Where the deeper detail lives (read on demand, not upfront)

- **`CLAUDE.md`** (repo root) — the canonical project brief: full tech
  stack, what's built vs. not, every "this looks like a bug but it's
  intentional" note, conventions to keep following. Read this in full
  before any non-trivial change.
- **`docs/security-audit.md`** + **`docs/full-platform-audit.md`** — the
  original 2026-07-22/23 security & platform audit. Most Critical/High
  findings here are closed; a few (documented dependency advisory with
  no safe fix, CSP `unsafe-inline`) are intentionally still open.
- **`docs/audits/2026-08-04-security-and-repository-organization/`** —
  the most recent audit pass. Start with its `README.md` for scope, then
  `01-security-audit-report.md` for findings and `08-deferred-risks-and-recommendations.md`
  for what's still open, prioritized IMMEDIATE/NEXT/LATER. As of this
  audit: RLS-016 (child-table RLS gap) and SEC-008 (raw error leakage,
  all 87 routes) are both **fully closed and live-verified** — don't
  re-flag either as an open finding without checking this doc first, it
  may already be stale by the time you read it if more work has landed
  since.
- **`tests/security.rls.test.ts`** — the live regression suite proving
  the RLS/RPC lockdowns actually hold against the real Supabase project.
  Skips gracefully (not fails) when `.env.local` isn't present.

## Known-open items worth knowing about before touching related code

(Full detail and reasoning in `08-deferred-risks-and-recommendations.md`
— this is just the headline list so you don't rediscover these from
scratch.)

- No safe fix yet for a Next.js-bundled `postcss`/`sharp` dependency
  advisory (only resolution found is a breaking downgrade to
  `next@9.3.3`) — re-check `npm audit` occasionally for a patched Next
  release, don't attempt a workaround upgrade without re-verifying.
- `schema.sql` vs. migrations drift (see above) — a real MIG-001 risk,
  not yet resolved.
- CSP still allows `unsafe-inline`/`unsafe-eval` — deliberately not
  tightened without a live-deployed environment to test against.
- `chore/mobile-readiness` (an older, superseded mobile implementation)
  and most other pre-2026-08-04 feature branches have been cleaned up —
  if you see a stale-branch reference in an old doc, it may no longer
  exist; check `git branch -a` rather than assuming.
- No payment gateway is wired in yet — checkout is cash-on-delivery only
  (a product decision, documented, not a gap to "fix").
