# Mahaly Security Audit

Audit started: 2026-07-22
Status: Initial static review complete; live database and runtime verification in progress.

## Severity summary

| Severity | Confirmed findings | Fixed |
|---|---:|---:|
| Critical | 2 | 2 implemented, deployment verification pending |
| High | 4 | 2 implemented, deployment verification pending |
| Medium | 5 | 0 |
| Low | 2 | 0 |

## Critical findings

### SEC-001 — Privileged PostgreSQL functions may be publicly executable

- **Severity:** Critical
- **Attack scenario:** An anonymous or ordinary authenticated client calls Supabase RPC directly for `cancel_order` or `place_order`. Because the functions are `SECURITY DEFINER`, the call can execute with the function owner's privileges rather than the caller's RLS rights. No `REVOKE EXECUTE` is present in the checked-in schema.
- **Affected code:** `supabase/schema.sql` function declarations around `cancel_order`, `place_order`, `handle_new_user`, and notification pruning.
- **Fix applied:** `20260722_security_boundaries.sql` revokes execution from public API roles and grants mutation RPCs only to `service_role`. It has not been applied to production yet.
- **Planned fix:** Revoke execution from `PUBLIC`, `anon`, and `authenticated` for mutation/trigger functions; grant only to `service_role` where server RPC access is required. Keep the RLS helper callable only by the minimum role required by its policy.
- **Verification required:** Direct anon/authenticated RPC calls must fail; service-role API order/cancel paths must still pass; triggers must still execute.
- **Remaining risk:** Until live privileges are verified and corrected, direct RPC bypass must be treated as exposed.

### SEC-002 — Checkout can bypass variant inventory and product visibility

- **Severity:** Critical
- **Attack scenario:** A caller submits a real product ID with an invalid size/color. The API fails to find a variant, emits an empty variant ID, and the database order function skips inventory decrement. A caller can also reference a draft, archived, or paused product because the lookup lacks storefront-status predicates.
- **Affected code:** `app/api/orders/route.ts`; `public.place_order` in `supabase/schema.sql`.
- **Fix applied:** Centralized validation, body/line/quantity caps, active-product checks, exact variant enforcement, rate limiting, and safe errors are implemented in the order route. Database privilege migration is pending deployment.
- **Planned fix:** Typed request schema, maximum line/quantity limits, published/unpaused/in-stock predicate, exact variant enforcement, database-owned price lookup, and regression tests.
- **Verification required:** Invalid variant, hidden product, excessive quantity, duplicate lines, and malformed shipping tests; concurrent stock test.
- **Remaining risk:** Guest checkout remains a public abuse surface and also requires distributed rate limiting.

## High findings

### SEC-003 — RLS exposes non-public product records

- **Severity:** High
- **Attack scenario:** An anonymous Supabase client queries `products` directly and receives draft, pending-review, archived, or brand-paused rows because the policy is `using (true)`.
- **Affected code:** `supabase/schema.sql` policy `Public can read products`.
- **Fix applied:** The migration replaces public product/variant policies with published/non-paused policies and adds authenticated brand-member policies. Admin catalog reads now use the server-only service-role client. Deployment verification is pending.
- **Planned fix:** Replace the policy with published/non-paused storefront predicates and verify dashboards use authorized service-role paths where broader visibility is needed.
- **Verification required:** Anon cannot read hidden states; admin and authorized brand owners retain required access.
- **Remaining risk:** Public RLS is row-level, not column-level; exposed product/brand columns also require review.

### SEC-004 — Storage namespace ownership is incomplete

- **Severity:** High
- **Attack scenario:** A brand user supplies a crafted or guessed nonexistent `folderId`. The route treats any nonexistent product folder as accessible, allowing arbitrary temporary folder creation and potentially deletion if a path is known.
- **Affected code:** `app/api/admin/products/images/route.ts`.
- **Fix applied:** Canonical folder validation, per-user draft namespaces, ownership-safe deletion, and binary signature verification are implemented with regression tests.
- **Planned fix:** Canonical identifier validation, brand/user-scoped temporary upload tokens or prefixes, exact deletion prefix validation, and content signature verification.
- **Verification required:** Cross-brand edit/delete attempts, traversal-like IDs, mismatched MIME/signature, oversize files.
- **Remaining risk:** Existing public bucket objects remain world-readable by design.

### SEC-005 — Dependency vulnerability in image-processing chain

- **Severity:** High
- **Attack scenario:** A crafted image reaches a vulnerable Sharp/libvips build in an affected runtime path.
- **Affected code:** Next.js transitive `sharp`; npm advisory `GHSA-f88m-g3jw-g9cj`.
- **Fix applied:** None. `npm audit` suggests downgrading Next.js to 9.3.3, which is unsafe and incompatible, so it was rejected.
- **Planned fix:** Identify a compatible patched Next.js/Sharp resolution, test production image behavior, and upgrade only with full validation.
- **Verification required:** Clean or documented audit result and successful build/image tests.
- **Remaining risk:** Exact exposure depends on Vercel's image pipeline and deployed binary.

### SEC-006 — Non-transactional privileged multi-table writes

- **Severity:** High
- **Attack scenario:** A product update succeeds, existing variants are deleted, and replacement insertion fails; or a user role/link transition fails halfway. The platform is left in a security or inventory-inconsistent state.
- **Affected code:** Brand product update route; admin user access route.
- **Fix applied:** Product/variant replacement now uses `replace_product_with_variants`, and profile/brand membership transitions use `set_user_access`. Both functions are transactional, search-path pinned, and executable only by `service_role`; routes retain server-side authorization and validation.
- **Verification performed:** TypeScript, lint, payload unit tests, and migration/diff inspection pass.
- **Verification required:** Forced rollback tests against the preview database after migrations are applied.
- **Remaining risk:** The RPC behavior is not considered deployed until preview migration verification succeeds.

## Medium findings

### SEC-007 — Public abuse protection is not distributed

- **Severity:** Medium
- **Attack scenario:** Attack traffic is distributed across serverless instances or repeatedly creates guest orders.
- **Affected code:** `lib/rateLimit.ts`; order, coupon, and application APIs.
- **Fix applied:** Local in-memory limits protect coupon/application routes only.
- **Planned fix:** Distributed/database-backed limiter plus request-size and per-order caps.

### SEC-008 — Raw infrastructure errors can reach clients

- **Severity:** Medium
- **Attack scenario:** A malformed request triggers a Supabase/Postgres/storage error whose message reveals schema or constraint details.
- **Affected code:** Multiple order, upload, admin, and brand routes.
- **Fix applied:** None globally.
- **Planned fix:** Stable public error codes, server-only structured logging, correlation IDs where useful.

### SEC-009 — Migration history is incomplete

- **Severity:** Medium
- **Attack scenario:** A new environment or rollback omits policies/functions that exist only in the cumulative schema, creating silent security drift.
- **Affected code:** `supabase/schema.sql`, `supabase/migrations/`.
- **Fix applied:** None yet.
- **Planned fix:** Establish a reviewed baseline and require ordered migrations for all changes.

### SEC-010 — No automated authorization/RLS tests

- **Severity:** Medium
- **Attack scenario:** A later refactor weakens an ownership check or policy without detection.
- **Affected code:** Repository-wide.
- **Fix applied:** None yet.
- **Planned fix:** Unit validation tests, route integration tests, and Supabase/RLS role-matrix tests.

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

## Controls verified in code

- Protected route handlers use server-side `getUser()` and role/ownership helpers.
- Client-supplied admin role values are allow-listed and require admin rank.
- Brand product access checks both authentication and `brand_slug` ownership.
- Product pricing is re-read from the database during checkout.
- File uploads have MIME allow-lists and size limits.
- Service-role secrets are referenced only from a server module and `.env.local` is not tracked.
- Global security headers include CSP, HSTS, frame restrictions, MIME sniffing protection, referrer policy, and permissions policy.

This document will be updated with the exact migration names, tests, and remaining risk as fixes land.
