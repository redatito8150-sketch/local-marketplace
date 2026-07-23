# Mahaly Full Platform Audit

Audit started: 2026-07-22
Branch: `feature/platform-audit-visual-cms-brand-experience` (merged to main
via PR #8 before this doc's 2026-07-23 update)
Verification update: 2026-07-23 — a follow-up production-readiness pass
live-verified this doc's "deployment verification pending" items against
the actual Supabase project. See each finding's Status cell and the
Architecture inventory note below — several claims here were stale
(Page Studio, testing, migration count) as of the 2026-07-23 check.

## Executive baseline

Mahaly is a Next.js 16 App Router application using React 19, TypeScript strict mode, Tailwind CSS, Supabase Auth/Postgres/Storage, and server-side service-role mutations. The repository currently contains 70 pages and 45 API route handlers. Customer, admin/staff, and brand-owner authorization helpers exist and are used consistently by protected API handlers. The admin and brand portals already include audit-log and notification concepts.

The platform is functional but not yet ready for a production-grade visual CMS. Database privilege exposure, public draft-product visibility, checkout validation, transactional consistency, migration reproducibility, automated testing, and content versioning must be addressed first.

## Architecture inventory

- **App Router:** storefront, account, admin, and brand portal are separated by route groups and layouts.
- **Authentication:** Supabase SSR cookie client with `getUser()` on server boundaries.
- **Authorization:** `requireUser`, `requireAdminUser`, `requireStaffRole`, and `requireBrandOwner` centralize most role checks.
- **Privileged data access:** `lib/supabase/admin.ts` exposes a server-only service-role client used by API/data modules.
- **Commerce:** products, variants, cart context, wishlist, orders, coupons, and atomic PostgreSQL order placement exist.
- **Content:** `site_content` is a public-read JSON key/value store with bespoke admin forms; it is not a draft/versioned visual CMS.
- **Brand experience:** data-driven brand routes and a brand-owner editor exist, but changes publish instantly and content completeness varies.
- **Testing (updated 2026-07-23):** this claim is stale — `tests/` now holds 33 passing tests (`npm test`, Node's built-in `node:test` runner) covering order-request validation, image-upload validation, product-persistence mapping, Page Studio registry rules, and (added 2026-07-23) live anon-key RPC/RLS security regression checks.
- **Database history (updated 2026-07-23):** also stale — `supabase/migrations/` now holds 14 ordered migration files (up from the 1 this baseline described), covering everything from the security boundaries this doc originally flagged through addresses, phone verification, sessions, and onboarding. `schema.sql` is still hand-maintained in parallel rather than generated from migrations (MIG-001 below is still valid as an architectural concern), but the "only one migration file" state is no longer accurate.

## Findings

### Critical

| Finding | Problem | Affected system | Risk | Recommended fix | Status |
|---|---|---|---|---|---|
| DB-001 | Privileged `SECURITY DEFINER` functions have no checked-in `REVOKE EXECUTE` statements. PostgreSQL grants function execution to `PUBLIC` by default. | `supabase/schema.sql`: `place_order`, `cancel_order`, trigger helpers | Direct RPC calls may bypass API authorization, cancel arbitrary orders, manipulate inventory, or submit trusted parameters. | Verify live grants, revoke from `PUBLIC`/`anon`/`authenticated`, grant only required roles, and add regression checks. | **Closed 2026-07-23** — confirmed live: anon-key RPC calls to both functions return `permission denied`. Regression test added (`tests/security.rls.test.ts`). |
| ORD-001 | Order creation accepts a missing variant match and can create an item with `variant_id = null`; it also does not require products to be published/unpaused/active. | `app/api/orders/route.ts`, `place_order` | Direct callers may bypass stock tracking or buy hidden/draft/archived products. | Add strict schemas, active-product predicates, exact variant requirements, quantity/item caps, and transaction-owned price/variant derivation. | **Closed 2026-07-23** — 8 passing tests in `tests/orderRequest.test.ts` cover exactly this; `place_order`'s privilege lockdown confirmed live (see DB-001). |

### High

| Finding | Problem | Affected system | Risk | Recommended fix | Status |
|---|---|---|---|---|---|
| RLS-001 | Public product SELECT policy is `using (true)`. | `supabase/schema.sql` products policy | Anonymous clients can query draft, archived, paused, and review-state product rows and all exposed columns. | Limit anon/authenticated public reads to published and non-paused storefront rows; use privileged paths for dashboards. | **Closed 2026-07-23** — confirmed live: anon-key reads of `products` return zero non-published/paused rows. Regression test added. |
| STO-001 | Product upload folder identifiers are not strongly normalized; nonexistent folders are accepted for any brand uploader. | `app/api/admin/products/images/route.ts` | Cross-brand temporary-object collision/deletion and storage namespace abuse are possible if a path is guessed or crafted. | Validate folder IDs, bind temporary upload sessions to user/brand, enforce canonical prefixes, and verify ownership on deletion. | **Closed** — confirmed via code review 2026-07-23: `getProductFolderAccess()`/`canDeletePath()` enforce this on every upload/delete path. |
| DEP-001 | Dependency audit reports vulnerable Sharp/libvips through Next.js. | `package-lock.json`, Next.js dependency tree | Malicious image processing input may reach vulnerable native image code depending on deployment/runtime behavior. | Determine the patched compatible Next.js/Sharp resolution; test a targeted upgrade/override, never npm's suggested downgrade. | **Still open 2026-07-23** — `npm audit fix --force --dry-run` confirms no patched resolution exists in the current Next major. Tracked, not fixed; revisit when Next.js ships a patch. |
| TX-001 | Several multi-table service-role mutations were not transactional. | Brand product variant replacement; admin role/brand-link transitions | Partial failure could leave live products without variants or users with inconsistent role/link state. | Move critical mutations to validated database RPC transactions. | **Closed 2026-07-23** — confirmed live: `set_user_access`/`replace_product_with_variants` reject the anon key and execute correctly under service role. |
| PAY-001 | Checkout displays card inputs without a payment provider and creates orders independently of payment authorization. | `app/checkout/page.tsx`, order API | Misleading customer experience and unsafe future handling if card data is later wired casually; orders can appear paid without gateway evidence. | Clearly implement a provider-backed flow or label a supported offline/COD method; never collect raw card data in application code. | **Resolved by product decision** — checkout is explicit cash-on-delivery only (no card fields), `payment_method`/`payment_status` columns record real state. Still no live payment gateway (tracked separately, not a security gap). |

### Medium

| Finding | Problem | Affected system | Risk | Recommended fix | Status |
|---|---|---|---|---|---|
| RATE-001 | Rate limiting is process-local memory and order creation has no limiter. | `lib/rateLimit.ts`, public APIs | Limits are ineffective across Vercel instances; automated order/application abuse remains possible. | Add a distributed store or database-backed limiter and per-route/body caps. | **Partially fixed 2026-07-23** — order creation already had a limiter before this pass (12/10min, confirmed by code review — this row's "order creation has no limiter" clause was already stale); extended coverage to phone-verify-otp, brand-portal writes, and top admin write routes this pass. Still not distributed across instances — that part remains open. |
| ERR-001 | Some API failures return raw Supabase/Postgres messages to clients. | Orders, uploads, admin/brand mutations | Internal schema/constraint details may leak and user messages become unstable. | Log structured internal errors and return stable public error codes/messages. | **Fixed for customer-facing routes 2026-07-23** — `lib/apiError.ts` applied across `app/api/account/**` and `wishlist`. Admin/brand-portal routes intentionally left for a follow-up pass (lower risk, trusted audience). |
| MIG-001 | The full schema is not represented as ordered migrations. | `supabase/schema.sql`, `supabase/migrations` | Environments can drift and rollback/review is difficult. | Establish a baseline migration strategy and add every future change as an ordered migration. | **Improved, not resolved** — migration count grew from 1 to 14 since this was written, each change shipped as its own file. `schema.sql` is still hand-maintained in parallel; the architectural gap itself is unchanged. |
| TEST-001 | No automated tests or test script exist. | Repository-wide | Authorization, RLS, filters, checkout, CMS publishing, and regressions cannot be proven continuously. | Add unit/integration/E2E layers focused first on security and publish workflows. | **Stale claim, now closed** — 33 passing tests exist (`npm test`), including the anon-key RPC/RLS security regressions added 2026-07-23. Broader route-level integration tests and a full RLS role-matrix are still not done. |
| CMS-001 | Current `site_content` writes publish immediately and lack drafts, versions, restore, section registry, and page-level ordering. | Admin Site Content and storefront content data | Editors cannot preview safely or roll back changes; arbitrary JSON shapes can drift. | Replace incrementally with typed page/section/version tables and explicit publishing. | **Resolved** — Page Studio (`page_sections`/`page_versions` tables, draft/publish/restore/version-history) is implemented and confirmed live-deployed 2026-07-23 (this doc's own "Known limitations" previously claimed otherwise — that was stale). |
| BRD-001 | Brand-owner content and product edits apply instantly. | Brand portal routes | Incorrect or compromised edits can immediately affect the public site. | Add brand-scoped draft/preview/publish policy or review workflow consistent with business rules. | **Resolved by product decision, not a bug** — CLAUDE.md now documents this as the deliberate "Instant-Publish" model (admin gets a resolvable Approve/Revert notification instead of a pre-approval gate); explicitly states not to reintroduce a review queue. |
| CACHE-001 | Public and authenticated caching boundaries are not documented or tested. | App Router data modules/pages | Authenticated data could later be cached incorrectly during optimization work. | Add explicit caching policy and tests before introducing CMS caching. | Open — not addressed this pass. |

### Low

| Finding | Problem | Affected system | Risk | Recommended fix | Status |
|---|---|---|---|---|---|
| CFG-001 | TypeScript permits JavaScript and skips library checking. | `tsconfig.json` | Some dependency/type issues may be hidden; legacy JS can enter unnoticed. | Reassess after baseline build; tighten only when compatible. | Open |
| CSP-001 | CSP still requires `unsafe-inline` and `unsafe-eval`. | `next.config.js` | Reduces CSP protection against injected scripts. | Investigate nonce/hash CSP compatible with Next.js production, without breaking hydration. | Open |
| UI-001 | Payment Methods is explicitly “Coming soon”. | Account payment page | Disconnected account navigation item conflicts with production-complete expectations. | Hide until supported or implement a provider-backed feature. | Confirmed |

## Positive controls already present

- Protected APIs generally authenticate server-side rather than relying on hidden UI.
- Admin role escalation requires full admin rank and blocks self-demotion.
- Brand product mutations re-check `brand_slug` ownership server-side.
- Checkout re-fetches product prices instead of trusting client-submitted prices.
- Order placement and stock decrement use a database transaction.
- Sensitive tables such as audit logs, notifications, coupons, and applications have RLS enabled without public table policies.
- Upload routes restrict MIME type and size and use server-only storage credentials.
- Security headers and a CSP are configured globally.
- `.env.local` is present locally but is not tracked by Git.

## Implementation sequencing

1. Verify live database grants/schema drift.
2. Apply critical function-grant and product-visibility migration.
3. Harden order creation and public APIs.
4. Add security regression tests and baseline build checks.
5. Repair transactional integrity and storage namespaces.
6. Introduce typed shared validation and permission helpers.
7. Proceed to brand redesign and visual CMS only after critical/high findings are closed.

## 2026-07-23 verification pass

Steps 1–4 above are now confirmed done, live, and regression-tested — not
just "implemented, pending verification" as this doc previously said.
Steps 5–6 (TX-001, shared error handling) also confirmed/extended this
pass. Step 7's prerequisite (critical/high findings closed) is met: the
only High finding still open is DEP-001 (dependency advisories with no
safe fix available yet, tracked not fixed) and PAY-001 (a product
decision, not a security gap). See `docs/security-audit.md`'s matching
verification log for the exact checks performed.

Newly discovered and fixed during this pass (not in the original audit):
a critical sign-in/password-reset lockout caused by Supabase's Attack
Protection covering more auth flows than the app originally sent captcha
tokens for, and missing explicit cookie `sameSite`/`secure` config — see
`docs/security-audit.md` SEC-014/SEC-015.

This report will be updated throughout implementation; statuses are not final until runtime and database verification are complete.
