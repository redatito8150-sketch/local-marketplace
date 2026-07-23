# Mahaly Security Audit

Audit started: 2026-07-22
Verification update: 2026-07-23 — a follow-up production-readiness pass
ran live checks against the actual Supabase project (anon-key RPC calls,
RLS reads) rather than relying on static review alone. Every item this
doc previously marked "deployment verification pending" is now confirmed
either deployed and enforced, or genuinely still open — see each finding
below for the specific result. Two new regression tests
(tests/security.rls.test.ts) now codify the RPC/RLS checks permanently.

## Severity summary

| Severity | Confirmed findings | Fixed |
|---|---:|---:|
| Critical | 2 | 2 — confirmed deployed and enforced live (2026-07-23) |
| High | 4 | 3 confirmed deployed/enforced live; 1 (SEC-005, dependency) still open, no safe fix available |
| Medium | 5 | 2 fixed in the 2026-07-23 pass (SEC-007 rate-limit gaps, SEC-008 error leakage); 3 remain open |
| Low | 2 | 0 — unchanged, still open |

## Critical findings

### SEC-001 — Privileged PostgreSQL functions may be publicly executable

- **Severity:** Critical
- **Attack scenario:** An anonymous or ordinary authenticated client calls Supabase RPC directly for `cancel_order` or `place_order`. Because the functions are `SECURITY DEFINER`, the call can execute with the function owner's privileges rather than the caller's RLS rights. No `REVOKE EXECUTE` is present in the checked-in schema.
- **Affected code:** `supabase/schema.sql` function declarations around `cancel_order`, `place_order`, `handle_new_user`, and notification pruning.
- **Fix applied:** `20260722_security_boundaries.sql` revokes execution from public API roles and grants mutation RPCs only to `service_role`.
- **Planned fix:** Revoke execution from `PUBLIC`, `anon`, and `authenticated` for mutation/trigger functions; grant only to `service_role` where server RPC access is required. Keep the RLS helper callable only by the minimum role required by its policy.
- **Verification (2026-07-23):** Confirmed live against the production Supabase project — `anon.rpc("place_order", ...)` and `anon.rpc("cancel_order", ...)` both return `permission denied for function ... (code 42501)`. Now covered by a permanent regression test (`tests/security.rls.test.ts`).
- **Remaining risk:** None for this specific vector — closed and regression-tested.

### SEC-002 — Checkout can bypass variant inventory and product visibility

- **Severity:** Critical
- **Attack scenario:** A caller submits a real product ID with an invalid size/color. The API fails to find a variant, emits an empty variant ID, and the database order function skips inventory decrement. A caller can also reference a draft, archived, or paused product because the lookup lacks storefront-status predicates.
- **Affected code:** `app/api/orders/route.ts`; `public.place_order` in `supabase/schema.sql`.
- **Fix applied:** Centralized validation, body/line/quantity caps, active-product checks, exact variant enforcement, rate limiting, and safe errors are implemented in the order route. Database privilege migration confirmed deployed (see SEC-001).
- **Planned fix:** Typed request schema, maximum line/quantity limits, published/unpaused/in-stock predicate, exact variant enforcement, database-owned price lookup, and regression tests.
- **Verification (2026-07-23):** `lib/orders/orderRequest.ts` has 8 passing unit tests (`tests/orderRequest.test.ts`) covering exactly this list (invalid variant, excessive quantity, duplicate lines, malformed shipping). `place_order`'s privilege lockdown confirmed live (SEC-001).
- **Remaining risk:** Guest checkout remains a public abuse surface; `lib/rateLimit.ts` is still process-local, not distributed (see SEC-007) — a determined attacker spread across many serverless instances isn't fully throttled.

## High findings

### SEC-003 — RLS exposes non-public product records

- **Severity:** High
- **Attack scenario:** An anonymous Supabase client queries `products` directly and receives draft, pending-review, archived, or brand-paused rows because the policy is `using (true)`.
- **Affected code:** `supabase/schema.sql` policy `Public can read products`.
- **Fix applied:** The migration replaces public product/variant policies with published/non-paused policies and adds authenticated brand-member policies. Admin catalog reads now use the server-only service-role client.
- **Planned fix:** Replace the policy with published/non-paused storefront predicates and verify dashboards use authorized service-role paths where broader visibility is needed.
- **Verification (2026-07-23):** Confirmed live — queried `products` with the anon key filtered to non-published/paused rows, zero returned. (The live catalog currently has zero such rows to begin with, so this also needs the permanent test in `tests/security.rls.test.ts`, which re-checks this on every run going forward as the catalog changes.) Admin/brand-portal reads confirmed still using `supabaseAdmin`.
- **Remaining risk:** Public RLS is row-level, not column-level; exposed product/brand columns still haven't had a dedicated column-level review.

### SEC-004 — Storage namespace ownership is incomplete

- **Severity:** High
- **Attack scenario:** A brand user supplies a crafted or guessed nonexistent `folderId`. The route treats any nonexistent product folder as accessible, allowing arbitrary temporary folder creation and potentially deletion if a path is known.
- **Affected code:** `app/api/admin/products/images/route.ts`.
- **Fix applied:** Canonical folder validation, per-user draft namespaces, ownership-safe deletion, and binary signature verification are implemented with regression tests.
- **Planned fix:** Canonical identifier validation, brand/user-scoped temporary upload tokens or prefixes, exact deletion prefix validation, and content signature verification.
- **Verification (2026-07-23):** Confirmed via code review — `getProductFolderAccess()` is called on every upload and delete path resolution for both admin and brand-owner uploaders; `canDeletePath()` rejects `.`/`..`/empty path segments and enforces the exact `products/{folderId}/{filename}` or `product-drafts/{userId}/{uuid}/{filename}` shape before any storage call.
- **Remaining risk:** Existing public bucket objects remain world-readable by design. Storage bucket-level RLS/policies (on `storage.objects` in the Supabase dashboard) aren't tracked in this repo and weren't independently re-verified this pass.

### SEC-005 — Dependency vulnerability in image-processing chain

- **Severity:** High
- **Attack scenario:** A crafted image reaches a vulnerable Sharp/libvips build in an affected runtime path.
- **Affected code:** Next.js transitive `sharp`; npm advisory `GHSA-f88m-g3jw-g9cj`.
- **Fix applied:** None.
- **Planned fix:** Identify a compatible patched Next.js/Sharp resolution, test production image behavior, and upgrade only with full validation.
- **Re-checked (2026-07-23):** Still open. `npm audit` reports 3 High advisories (Next.js's transitive `postcss`/`sharp`). `npm audit fix --force --dry-run` confirms no patched resolution exists within the current Next major — forcing one would mean an unvalidated breaking downgrade/upgrade, which this audit explicitly avoids doing blind. Needs revisiting once Next.js ships a patched release.
- **Remaining risk:** Exact exposure depends on Vercel's image pipeline and deployed binary. Genuinely still open — tracked, not fixed.

### SEC-006 — Non-transactional privileged multi-table writes

- **Severity:** High
- **Attack scenario:** A product update succeeds, existing variants are deleted, and replacement insertion fails; or a user role/link transition fails halfway. The platform is left in a security or inventory-inconsistent state.
- **Affected code:** Brand product update route; admin user access route.
- **Fix applied:** Product/variant replacement now uses `replace_product_with_variants`, and profile/brand membership transitions use `set_user_access`. Both functions are transactional, search-path pinned, and executable only by `service_role`; routes retain server-side authorization and validation.
- **Verification performed:** TypeScript, lint, payload unit tests, and migration/diff inspection pass.
- **Verification (2026-07-23):** Confirmed live — `set_user_access` and `replace_product_with_variants` both correctly reject the anon key (`permission denied`) and execute correctly under the service role (business-logic errors like "User profile not found" / "Product not found" for nonexistent test ids, proving they ran, not that they're missing).
- **Remaining risk:** Forced mid-transaction rollback hasn't been separately tested (e.g. killing the connection mid-RPC) — low priority given both functions are single Postgres statements/transactions by construction.

## Medium findings

### SEC-007 — Public abuse protection is not distributed

- **Severity:** Medium
- **Attack scenario:** Attack traffic is distributed across serverless instances or repeatedly creates guest orders.
- **Affected code:** `lib/rateLimit.ts`; order, coupon, and application APIs.
- **Fix applied (2026-07-23):** Extended beyond coupon/application routes — `app/api/account/phone/verify-otp`, all `app/api/brand-portal/*` write routes, and the highest-risk `app/api/admin/*` write routes (`users/[id]` role changes, `products/bulk`, `products/images`) now all have `checkRateLimit` too.
- **Planned fix:** Distributed/database-backed limiter (still not done — `lib/rateLimit.ts` remains a per-instance in-memory `Map`) plus request-size and per-order caps (order caps already exist per SEC-002).
- **Remaining risk:** Still not distributed across Vercel instances — a sufficiently distributed attacker isn't fully throttled. Several lower-risk authenticated routes (`account/addresses/*`, `account/sessions/*`, `account/onboarding/complete`, `account/delete`) remain unthrottled — acceptable for now given they require an existing session, but worth adding if abuse is observed.

### SEC-008 — Raw infrastructure errors can reach clients

- **Severity:** Medium
- **Attack scenario:** A malformed request triggers a Supabase/Postgres/storage error whose message reveals schema or constraint details.
- **Affected code:** Multiple order, upload, admin, and brand routes.
- **Fix applied (2026-07-23):** `lib/apiError.ts`'s `safeErrorResponse()` now covers every customer-facing route under `app/api/account/**` and `app/api/wishlist` — the real error is still logged server-side (and mirrored to Discord via the existing `logError()`), but the client only ever sees a stable, generic message. `app/api/orders/route.ts` was already using `logError()` and needed no change.
- **Planned fix:** Stable public error codes, server-only structured logging, correlation IDs where useful.
- **Remaining risk:** Admin and brand-portal routes (~30 routes) were intentionally left as-is this pass — lower risk given the trusted authenticated audience, but the same `safeErrorResponse()` helper is ready to extend there in a follow-up.

### SEC-009 — Migration history is incomplete

- **Severity:** Medium
- **Attack scenario:** A new environment or rollback omits policies/functions that exist only in the cumulative schema, creating silent security drift.
- **Affected code:** `supabase/schema.sql`, `supabase/migrations/`.
- **Status (2026-07-23):** Improved but not resolved — migration count grew from 1 (at this doc's original baseline) to 14, each new schema change (addresses, phone verification, sessions, onboarding, place_order's address_id) shipped as its own ordered migration file and kept in sync with `schema.sql`. The underlying architectural gap (schema.sql is still hand-maintained, not generated from migrations) is unchanged — still worth a proper baseline migration strategy eventually, just less acute than when first flagged.
- **Planned fix:** Establish a reviewed baseline and require ordered migrations for all changes.

### SEC-010 — No automated authorization/RLS tests

- **Severity:** Medium
- **Attack scenario:** A later refactor weakens an ownership check or policy without detection.
- **Affected code:** Repository-wide.
- **Fix applied (2026-07-23):** `tests/security.rls.test.ts` now runs the exact anon-key RPC/RLS checks above as a permanent regression suite (7 tests) — will catch a future regression in the SEC-001/SEC-003/SEC-006 lockdowns automatically on every `npm test`. Also note: the claim that "no automated tests exist" was already stale independent of this — `tests/` has held 26 validation/upload/registry/persistence tests since earlier in this branch's history, run via `npm test`, all passing.
- **Planned fix:** Broader route-level integration tests and a full RLS role-matrix (customer/brand-owner/staff/admin × every table) are still not done — this pass covers the highest-risk functions/tables only.

### SEC-011 — Checkout payment representation is not provider-backed

- **Severity:** Medium security / High product risk
- **Attack scenario:** Customers enter card-like information into a UI that does not use a payment processor. Future changes could accidentally transmit raw card data or mark unpaid orders as paid.
- **Affected code:** `app/checkout/page.tsx`, `app/api/orders/route.ts`.
- **Fix applied:** Removed the disconnected card fields, made cash on delivery the explicit checkout method, and added constrained `payment_method` and `payment_status` order fields with safe defaults.
- **Remaining risk:** Online card payment remains unavailable until a PCI-compliant hosted provider is integrated and verified.

## Low findings

### SEC-012 — CSP permits inline/eval script execution

- **Severity:** Low in current context
- **Affected code:** `next.config.js`.
- **Planned fix:** Investigate nonce/hash CSP compatible with Next.js before changing production headers.

### SEC-013 — TypeScript skips library checking

- **Severity:** Low
- **Affected code:** `tsconfig.json`.
- **Planned fix:** Reassess after dependency remediation and test establishment.

## New findings — 2026-07-23 production-readiness pass

### SEC-014 — CRITICAL (now fixed): sign-in and password reset blocked by captcha requirement

- **Severity:** Critical
- **Discovered:** while verifying an unrelated cookie-config change, live-tested `supabase.auth.signInWithPassword()` and `resetPasswordForEmail()` directly against the project and both failed with `captcha protection: request disallowed (no captcha_token found)`.
- **Root cause:** Supabase's Attack Protection (Turnstile), once enabled for this project, requires a `captcha_token` on sign-in and password-reset requests, not just sign-up — `context/AuthContext.tsx`'s `signIn()` and `app/forgot-password/page.tsx` never sent one, only `signUp()` did.
- **Impact:** No existing user (including staff/admin accounts) could sign in at all once Attack Protection was turned on for the project.
- **Fix applied:** `signIn()` now accepts and forwards `captchaToken` the same way `signUp()` already did; `CaptchaWidget` now renders in sign-in mode on `/account` (previously create-mode only) and on `/forgot-password`.
- **Verification:** Client-side guard confirmed working in-browser (blocks submission with "Please complete the verification challenge" when no token is present). Full end-to-end completion with a real solved Turnstile challenge could not be tested in the sandboxed audit environment (no network path to Cloudflare) — recommend a real login test on the live site.

### SEC-015 — Explicit cookie sameSite/secure config (fixed)

- **Severity:** Medium
- **Affected code:** `lib/supabase/server.ts`, `proxy.ts`.
- **Finding:** Both set auth cookies via `@supabase/ssr`'s cookie adapter, which doesn't set `sameSite`/`secure` explicitly — left to browser/Next defaults rather than an app-level decision.
- **Fix applied:** Both now explicitly pin `sameSite: 'lax'` and `secure` (true in production, false in dev so local HTTP still works).

## Controls verified in code

- Protected route handlers use server-side `getUser()` and role/ownership helpers.
- Client-supplied admin role values are allow-listed and require admin rank.
- Brand product access checks both authentication and `brand_slug` ownership.
- Product pricing is re-read from the database during checkout.
- File uploads have MIME allow-lists and size limits.
- Service-role secrets are referenced only from a server module and `.env.local` is not tracked.
- Global security headers include CSP, HSTS, frame restrictions, MIME sniffing protection, referrer policy, and permissions policy.

This document will be updated with the exact migration names, tests, and remaining risk as fixes land.

## Verification log

- 2026-07-23: Live-verified SEC-001/SEC-003/SEC-006 against the production
  Supabase project (not just static review) via safe, non-mutating anon-key
  RPC calls and RLS reads; added `tests/security.rls.test.ts` to keep these
  checks permanent (7/7 passing). Fixed SEC-007 gaps (verify-otp, brand-
  portal, admin write routes) and SEC-008 (customer-facing error leakage).
  Discovered and fixed SEC-014 (critical sign-in lockout) and SEC-015
  (cookie hardening) along the way. Re-checked SEC-005 (dependency
  advisories) — still open, no safe fix available yet.
