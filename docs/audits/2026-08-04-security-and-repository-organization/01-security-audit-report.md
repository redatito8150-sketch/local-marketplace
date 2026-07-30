# Security Audit Report — 2026-08-04

## New finding this pass

### RLS-016 — Product child tables leak option/variant/color-image data for non-public products

- **Severity:** High
- **Vulnerable path:** `product_options`, `product_option_values`,
  `product_variant_values`, and `product_color_images` (created in
  `20260731000002_product_options_and_variant_values.sql`) each had an
  unconditional `using (true)` public SELECT policy — no join back to the
  parent product's `status`/`paused_by_brand`.
- **Who can exploit it:** Anyone with the public anon key (i.e. anyone —
  it's shipped in the client bundle by design), calling the Supabase
  REST/JS API directly instead of going through the app's own
  server-rendered pages, which do filter by product status at the
  application layer.
- **Required permissions:** None — anon key only.
- **Affected data:** Which Color/Size option values a Draft, Archived, or
  brand-paused product has, and its Color image URLs (including
  unreleased-product photography before a brand's public launch).
- **Expected impact:** Pre-launch product data disclosure — a real
  confidentiality issue for a marketplace where brands stage new
  collections as Draft before a coordinated launch, but not a path to
  account takeover, payment fraud, or write access.
- **Evidence:**
  - Direct comparison against the three sibling tables that already got
    this exact fix: `products` (`SEC-003`/`RLS-001`, closed 2026-07-23),
    `product_variants` (`20260722101910_security_boundaries.sql`), and
    `product_media` (`20260801000001_inventory_variants_refinement.sql`)
    all scope public SELECT to `status = 'published' and
    paused_by_brand = false`. The four tables above were never given the
    same treatment in any later migration — confirmed by grepping every
    migration after `20260731000002` for policy changes on these four
    table names; none exist.
  - `lib/data/products.ts` and `lib/data/variants.ts` (the storefront read
    path) both use `lib/supabase/client.ts` — the anon-key client — and
    query `product_variant_values` directly, relying entirely on RLS
    (not an application-level `WHERE`) to keep hidden products' data out.
  - Live read-only reproduction: a probe script queried
    `product_color_images`/`product_options`/`product_variant_values`
    with the anon key and cross-referenced returned `product_id`s against
    the anon-visible `products` set. Result: 0 rows returned in either
    direction, because **the live catalog currently has zero
    Draft/Archived/paused products with option or color-image data set**
    — the same "nothing to leak yet" situation the original SEC-003
    verification documented for the `products` table itself. This does
    not disprove the gap; it means there is no data to observe leaking
    *right now*. The gap is proven by the policy definition itself
    (`using (true)`, no predicate), not by an empirical leak.
- **Mitigation implemented:** `supabase/migrations/20260804000001_scope_product_child_table_rls.sql`
  replaces all four `using (true)` policies with the same
  `status = 'published' and paused_by_brand = false` predicate (joined
  through `product_options`/`product_variants` where the table doesn't
  have `product_id` directly), plus an authenticated `brand_staff`
  bypass so brand-portal editors keep full read access to their own
  Draft products. Admin/service-role reads are unaffected — they already
  use `supabaseAdmin`, which bypasses RLS.
- **Residual risk:** The migration is authored but **not applied to the
  live Supabase project** in this pass — applying migrations to
  production without explicit permission was out of scope for this task.
  See `09-production-readiness-checklist.md` for the exact apply command
  and post-apply verification step.

## Findings carried over from the prior audit, re-verified this pass

All of the following are documented in detail in the existing
`docs/security-audit.md` and `docs/full-platform-audit.md` (already
merged to `main`). This pass re-verified rather than re-derived them:

| ID | Status re-confirmed this pass | How |
|---|---|---|
| SEC-001 / DB-001 (privileged RPC lockdown) | Still closed | `tests/security.rls.test.ts` — all anon-key RPC calls to `place_order`/`cancel_order`/`set_default_address`/`set_user_access`/`replace_product_with_variants` still return `permission denied` live. |
| SEC-003 / RLS-001 (`products` table RLS) | Still closed | Same test file, live anon-vs-service-role comparison returns 0 leaked rows. |
| TX-001 / SEC-006 (transactional multi-table writes) | Still closed | `set_user_access`/`replace_product_with_variants` still reject anon live. |
| `SECURITY DEFINER` search_path pinning | Consistent | Every one of the 54 `security definer` occurrences across `supabase/migrations/*.sql` + `schema.sql` has a matching `set search_path` — no gap found. |
| SEC-005 / DEP-001 (Sharp/PostCSS via Next.js) | Still open, unchanged | `npm audit` still reports the same 3 High advisories (Next.js → postcss/sharp transitive). No patched resolution exists in the current Next major (same conclusion as the 2026-07-23 pass). |
| SEC-008 / ERR-001 (raw error leakage) | Still open on admin/brand-portal routes (as already documented) | Confirmed 35 admin routes + 10 brand-portal routes still return `error.message` directly. This was already flagged as an explicit "remaining risk, intentionally deferred" in SEC-008 — not a new finding, just re-confirmed still true. |
| SEC-012/CSP-001 (CSP allows `unsafe-inline`/`unsafe-eval`) | Still open, unchanged | `next.config.js` unchanged since the prior audit. |

## New areas checked this pass, no issues found

- **Admin-only enforcement of the new Featured toggle** (added earlier in
  this session's separate Product Editor work, audited here as part of
  this security pass): `app/api/admin/products/bulk/route.ts`'s new
  `feature`/`unfeature` actions are gated by the same
  `requireStaffRole("manager")` check as `publish`/`archive`/`delete`,
  rate-limited (`checkRateLimit`), and audit-logged. The brand-portal API
  (`app/api/brand-portal/products/[id]/route.ts`) explicitly
  `delete productPayload.featured` before every write, and its `POST`
  create route forces `productPayload.featured = false`. No path exists
  for a brand owner/assistant to set `featured` through any route.
- **`dangerouslySetInnerHTML`** — only one match in the whole app
  (`lib/pageStudio/registry.ts`), and it's a build-time registry
  constant, not user input rendered to HTML.
- **`target="_blank"`** — no matches at all in the app code (storefront
  or admin), so no `rel="noopener"` gap to fix.
- **`NEXT_PUBLIC_*` naming** — every `NEXT_PUBLIC_` prefixed value found
  (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) is
  a value that's safe-by-design to expose (Supabase's anon key is meant
  to be public; Turnstile's site key is the public half of the
  challenge). No server secret was found under a `NEXT_PUBLIC_` name.
- **`.env.local`** — present locally, not tracked by Git (`.gitignore`
  covers `.env*.local`); `.env.local.example` and
  `apps/mobile/.env.example` contain placeholders only, no real values.

## False positives rejected

- The 12 `using (true)` public-SELECT policies on `size_profiles`,
  `size_profile_values`, `taxonomy_size_profiles`, `option_types`
  (pre-2026-08-01-fix version), `option_values`, and `site_content` were
  reviewed and are **not** findings: these are shared, brand-agnostic
  platform vocabulary (global size/option taxonomy) or already-public
  CMS content (`site_content`, server-only writes via service role), not
  per-product or per-brand private data. `option_types`/`option_values`
  specifically were already re-scoped correctly in
  `20260801000001_inventory_variants_refinement.sql` (their earlier
  `using (true)` policy was explicitly dropped and replaced) — the
  earlier grep hit on those two names was against a since-superseded
  migration file, not the live policy.
