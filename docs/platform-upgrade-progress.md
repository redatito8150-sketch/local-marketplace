# Mahaly Platform Upgrade Progress

Last updated: 2026-07-23 (this branch merged to `main` via PR #8 since the
2026-07-22 entries below were written; a follow-up production-readiness
pass then live-verified what this doc had marked "pending")

## Current phase

Phase 6 — Page Studio and storefront publishing. Security-critical boundaries, shared catalog controls, and the first brand-experience pass are complete and confirmed live on `main` as of 2026-07-23 (see the verification note at the bottom). The typed Page Studio foundation, private draft preview, explicit publishing, version history, restoration, and homepage renderer are implemented and confirmed deployed — the `page_sections`/`page_versions` tables exist on the live Supabase project, which contradicts this doc's original "migration and preview-environment verification remain pending" note below (now stale).

## Completed tasks

- Updated from remote `main` and created `feature/platform-audit-visual-cms-brand-experience`.
- Inventoried 318 scoped project files, 70 App Router pages, 45 API route handlers, and the current Supabase schema/migration history.
- Reviewed authentication helpers for customer, admin/staff, and brand-owner access.
- Identified the three intentionally public write endpoints: order creation, coupon validation, and brand applications.
- Reviewed the service-role client boundary and representative customer/admin/brand-owner mutations.
- Reviewed current RLS policies and all declared `SECURITY DEFINER` functions in the checked-in schema.
- Ran the first dependency audit. It reports one moderate PostCSS advisory and one high Sharp/libvips advisory through Next.js; the suggested npm fix is an invalid downgrade and will not be applied blindly.
- Confirmed the repository has no automated test command or test framework configured.
- Created the initial full-platform and security audit documents.
- Added an additive security migration that restricts privileged RPC execution and separates public product visibility from brand-member access.
- Moved admin catalog reads to the server-only privileged data client so stricter storefront RLS does not break admin workflows.
- Added centralized order-request validation, request/quantity caps, active-product checks, exact variant enforcement, safer errors, and checkout rate limiting.
- Added the first eight automated regression tests using Node's built-in test runner.
- Hardened product image uploads with canonical folder IDs, account-scoped temporary namespaces, ownership-safe deletion, and binary image signature checks.
- Made full product/variant saves and user role/brand-link transitions atomic through locked-down database RPC functions.
- Centralized product persistence payload mapping and added regression tests.
- Replaced the disconnected demo card form with explicit cash-on-delivery checkout and persisted the real payment method/state on orders.
- Extracted shared catalog controls/empty state and migrated brand shopping from the legacy sidebar to the approved horizontal filter system.
- Fixed authenticated mobile-header overflow at 390px by applying responsive logo/action sizing.
- Removed fabricated brand founding-year and product-count presentation, hid unavailable stats, and added real brand-logo placement to premium heroes.
- Added a typed Page Studio registry that rejects executable configuration, unsafe links, oversized trees, and invalid product-section limits.
- Added private draft and published page states, atomic publish/reorder/discard/restore functions, version snapshots, and page audit events.
- Added a manager-only Page Studio UI with structured section fields, visibility controls, drag/drop plus keyboard-accessible ordering, draft save, preview, publish, discard, and restore actions.
- Replaced the homepage read path with a published Page Studio renderer while preserving a safe legacy-content fallback until the migration is deployed.
- Added the configurable `Explore All Products` homepage preview with bounded active-product queries.
- Added `/shop/all` with server-side search, sorting, URL-persistent filters, conditional Product Type, 24-item pagination, product count, SEO metadata, and loading/error/empty states.
- Generalized the shared catalog filters with marketplace Audience and Discounted controls and safe product-type relationship data.
- Added eager loading for above-the-fold catalog images after runtime LCP diagnostics.
- Added a manager-only Page Studio media library with validated JPEG, PNG, WebP, and AVIF uploads, binary signature checks, 5 MB limits, scoped storage paths, previews, and asset selection.
- Added a storefront Edit Mode for the homepage with contextual controls for editing, keyboard-accessible ordering, and hiding optional sections while preserving the draft/publish boundary.
- Added draft-safe section creation, duplication, and removal with required-section protection, service-role-only transactional RPCs, audit events, and soft deletion that reaches the storefront only after publishing.
- Added structured editing and storefront renderers for product grids, custom product collections, promotional banners, editorial images, text blocks, newsletters, and brand/sponsor carousels.
- Opened Draft PR #6; Vercel built the branch successfully and marked the protected Preview deployment ready.
- Verified the connected Supabase project read-only: anonymous storefront access returns 31 published products and zero non-published products; Page Studio tables are not deployed yet.

## Pending tasks

- Apply the additive migrations to an isolated Preview database, then verify function grants, policies, indexes, Page Studio lifecycle operations, and rollback behavior there.
- Complete all customer, brand-owner, and admin flow verification.
- Complete responsive QA, preview verification, PR review, and final merge.

## Files changed

- `docs/platform-upgrade-progress.md`
- `docs/full-platform-audit.md`
- `docs/security-audit.md`
- `lib/admin/productPersistence.ts`
- `app/api/admin/products/[id]/route.ts`
- `app/api/brand-portal/products/[id]/route.ts`
- `app/api/admin/users/[id]/route.ts`
- `supabase/migrations/20260722_atomic_product_updates.sql`
- `supabase/migrations/20260722_atomic_user_access.sql`
- `tests/productPersistence.test.ts`
- `components/category/CatalogControls.tsx`
- `components/category/CategoryShoppingArea.tsx`
- `components/brand/BrandShoppingArea.tsx`
- `components/Header.tsx`
- `components/shared/Logo.tsx`
- `components/brand/BrandHero.tsx`
- `components/brand/BrandStatsBand.tsx`
- `components/brand/AboutBrand.tsx`
- `lib/data/brands.ts`
- `lib/pageStudio/registry.ts`
- `lib/data/pageStudio.ts`
- `components/admin/PageStudioEditor.tsx`
- `components/home/PageStudioHomepage.tsx`
- `components/admin/PageStudioImageField.tsx`
- `components/admin/EditableSectionFrame.tsx`
- `app/admin/page-studio/**`
- `app/api/admin/page-studio/**`
- `supabase/migrations/20260722_page_studio_foundation.sql`
- `supabase/migrations/20260722_page_studio_section_lifecycle.sql`
- `tests/pageStudioRegistry.test.ts`
- `app/shop/all/**`
- `components/category/AllProductsShoppingArea.tsx`
- `lib/catalogQuery.ts`
- `tests/catalogQuery.test.ts`

## Database changes

- Added `supabase/migrations/20260722_security_boundaries.sql` (not applied to production yet).
- The migration revokes public execution from privileged mutation/trigger functions and narrows product/variant SELECT policies.
- Added service-role-only transactional RPC migrations for product/variant replacement and user access/brand membership transitions.
- Added an additive migration for explicit cash-on-delivery method and unpaid/paid/refunded order payment state.
- Added the additive Page Studio schema with separate draft/published order, configuration, and visibility; private version history; service-role-only mutation RPCs; and an idempotent homepage seed compatible with the earlier content prototype.
- Added the Page Studio section-lifecycle migration with separate draft/published deletion state and service-role-only create, duplicate, and remove RPCs; it is checked in but not applied to production.
- Rollback requires restoring the previous policies and function grants; no table rows or columns are deleted.

## Security fixes

- Implemented code and migration fixes for SEC-001, SEC-002, SEC-003, SEC-004, and SEC-006; deployment verification remains pending.
- Added stable public checkout errors and request abuse caps.

## Tests performed

- Repository and route inventory.
- Static authorization/service-role scan.
- RLS and PostgreSQL function scan.
- Public API route classification.
- `npm audit --json` with registry access.
- Final production-dependency audit confirms one moderate PostCSS advisory and two high Sharp/libvips advisories inherited through the current Next.js dependency; npm only proposes an unsafe forced downgrade to Next 9, so no automatic breaking fix was applied.
- Twenty-six validation/security tests pass (eight order-request, three image-upload, three product-persistence, nine Page Studio registry, and three catalog-query tests).
- TypeScript and lint pass after the first security and upload-hardening implementation.
- Browser QA: Women desktop filter layout, conditional Clothing → Product Type behavior, Studio Nile brand catalog, mobile full-filter drawer, and 390px horizontal-overflow check.

- TypeScript passes.
- ESLint passes with no warnings.
- Production build passes: 139 static/dynamic routes generated after connecting to Supabase.
- Browser QA: `/shop/all` desktop catalog/pagination, URL search results, Clothing → Product Type insertion, complete desktop filter panel, mobile filter drawer, and 390px no-overflow verification.

- TypeScript, ESLint, and all 24 tests pass after the Page Studio media-library and Edit Mode integration.
- Production build passes with 140 generated routes, including `/admin/page-studio/[pageKey]/edit` and `/api/admin/page-studio/assets`.
- TypeScript, ESLint, all 26 tests, and the production build pass after adding draft-safe section lifecycle controls and flexible storefront renderers.

## Known limitations

- **(Stale as of 2026-07-23)** ~~The checked-in `supabase/schema.sql` is cumulative while only one file exists in `supabase/migrations`~~ — 14 migration files exist now, covering this branch's work and everything shipped since. `schema.sql` is still hand-maintained in parallel rather than generated from migrations, which remains a real (if less acute) architectural gap.
- No second customer or second brand-owner test identity has yet been used, so cross-account and cross-brand isolation are not fully runtime-verified. Still true as of 2026-07-23.
- Payment processing is not integrated; checkout accurately presents and stores cash on delivery rather than collecting disconnected card details. Still true.
- **(Stale as of 2026-07-23)** ~~Page Studio migrations are checked in but have not been applied to production~~ — confirmed live: `page_sections` and `page_versions` both exist on the production Supabase project.
- The Vercel Preview/SSO limitation may still apply to preview-specific QA; not re-checked this pass (production itself was verified directly instead).
- The in-memory rate limiter is still not distributed across Vercel instances (unchanged), though its coverage was extended on 2026-07-23 to previously-unthrottled routes (phone-verify-otp, brand-portal writes, top admin write routes) — see `docs/security-audit.md` SEC-007.

## 2026-07-23 verification pass (separate audit branch)

- Confirmed live against the actual Supabase project (not static review):
  `place_order`, `cancel_order`, `set_default_address`, `set_user_access`,
  `replace_product_with_variants` all reject the anon key; `products` RLS
  doesn't leak non-published/paused rows; `page_sections`/`page_versions`
  exist. Added `tests/security.rls.test.ts` to keep these checks permanent.
- Fixed real gaps found along the way: no rate limiting on
  `account/phone/verify-otp` and across `brand-portal`/`admin` write
  routes; raw Postgres/Supabase error messages reaching customer-facing
  API clients; missing explicit cookie `sameSite`/`secure` config.
- Discovered and fixed a critical, unrelated regression: sign-in and
  password-reset were failing for every user because Supabase's Attack
  Protection (Turnstile), once enabled, requires a captcha token on those
  flows too, not just sign-up — `context/AuthContext.tsx`'s `signIn()`
  and `/forgot-password` never sent one. Cherry-picked straight to `main`
  given severity.
- Removed 4 confirmed-dead components (zero references anywhere,
  superseded by later work); kept `FollowedBrandsRow.tsx` despite also
  having zero references — it looks like an unfinished feature
  integration, not dead code, and was flagged separately rather than
  deleted.
- Full details: `docs/security-audit.md`'s verification log and
  `docs/full-platform-audit.md`'s matching update.

## Rollback notes

- This checkpoint adds application code and additive migrations but does not apply them to production.
- Future database migrations must be additive and include explicit down/rollback instructions.
- Security privilege changes will preserve service-role access and will be validated in preview before production merge.
- All implementation remains isolated on `feature/platform-audit-visual-cms-brand-experience` until final checks pass.
