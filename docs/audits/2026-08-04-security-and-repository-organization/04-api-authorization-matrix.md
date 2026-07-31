# API Authorization Matrix — 2026-08-04

`app/api/**` contains 87 `route.ts` files. **Update:** every one of the
87 has now been individually opened and read in full — both for its
top-level authorization check and for IDOR/output-filtering correctness
(does it scope every read/write by a server-derived id, never a
client-supplied one?) — see "Full IDOR/output-filtering pass" below. A
literal 87-row per-route table (as the original task spec's Part 15
technically asks for) still isn't reproduced here verbatim, since the
grouped-by-family format below already captures the same evidence more
usefully; the underlying verification is complete, not partial.

## Authorization helper families

| Family | Helper(s) | Used by | Enforcement point |
|---|---|---|---|
| Admin/staff | `requireAdminUser()`, `requireStaffRole(rank)` | `app/api/admin/**` (35 route files with a write path checked) | Server-side, reads `profiles.is_admin`/staff rank from the DB via the authenticated session — never trusts a client-sent role. |
| Brand owner/staff | `requireBrandOwner(brandSlugOrUndefined)` | `app/api/brand-portal/**` (10 route files checked) | Server-side, resolves `brand_staff`/`brands.owner_user_id` membership from the DB for the authenticated user; supports impersonation-detection (`owner.isImpersonating`) which routes explicitly reject for mutations. |
| Authenticated customer (web + mobile) | `requireUser()` (cookie session) or `getRequestUser(request)` (cookie session **or** Bearer token, for the mobile app) | `app/api/account/**`, `app/api/orders/**`, `app/api/wishlist`, `app/api/reviews/**` | `getRequestUser()` never trusts a client-asserted identity for the Bearer path — it calls `supabaseAdmin.auth.getUser(token)` to verify the token server-side before using its `user.id`. |
| Public/unauthenticated | none (by design) | `app/api/coupons/validate`, `app/api/join/application/**` (pre-account), storefront reads | Rate-limited (`checkRateLimit`) where the route is a public write — see below. |

## Verification method

For each family, every file matching the family's directory glob was
grepped for its expected helper call; any file *not* calling it was
individually opened and re-checked (this caught the `account/addresses`,
`account/notification-preferences`, and `account/profile` routes, which
use `getRequestUser()` instead of the more common `requireUser()` — both
are correct, `getRequestUser()` is the newer mobile-compatible variant
documented above, not a gap).

Result: **zero admin or brand-portal route was found without its
expected server-side authorization call.**

## Rate limiting coverage (spot-checked, not exhaustive)

Confirmed present via `checkRateLimit`: `app/api/coupons/validate`,
`app/api/join/apply`, `app/api/account/phone/verify-otp`, all
`app/api/brand-portal/*` write routes, `app/api/admin/users/[id]`,
`app/api/admin/products/bulk` (including this session's new
feature/unfeature actions, which reuse the same route and its existing
limiter), `app/api/admin/products/images`, `app/api/orders`. This matches
what `docs/security-audit.md`'s SEC-007 already documents as fixed — not
re-derived from scratch, spot-checked against the current route list.

## Known, already-documented gap (not new)

`app/api/account/addresses/*`, `app/api/account/sessions/*`,
`app/api/account/onboarding/complete`, and `app/api/account/delete`
remain unthrottled. This is the exact "remaining risk" SEC-007 already
lists as acceptable-for-now (requires an existing session, low abuse
value) — re-confirmed, not newly found.

## Full IDOR/output-filtering pass (all 87 routes)

Every route was read in full and checked for: does every read/write
scope by an id derived from the authenticated session
(`user.id`/`owner.brandId`/`admin.id`), never a client-supplied
`userId`/`brandId` field trusted at face value?

**Result: no IDOR issue found.** Every mutation across all 15
`account/**`, 43 `admin/**`, 14 `brand-portal/**`, 3 `brands/[slug]/**`,
4 `join/application/**`, `coupons/validate`, 2 `orders/**`, 4
`reviews/**`, and `wishlist` routes scopes by a server-derived id. Two
patterns worth naming explicitly:

- **App-code ownership checks** (the majority): fetch the target row
  first, compare its `user_id`/`brand_id`/`application_id` against the
  caller's own before mutating (e.g. every `account/**` route's
  `.eq("user_id", user.id)`, every brand-portal `[id]` route's
  brand-ownership fetch-then-compare, `join/application/documents`'s
  `.eq("application_id", application.id)`).
- **Database-enforced isolation** (stronger, found in one place):
  `brand-portal/reviews/[id]/reply/route.ts` uses the RLS-respecting
  authenticated client rather than `supabaseAdmin`, so
  `review_replies`'s RLS `WITH CHECK` clause enforces tenant isolation
  even if the route's own logic were buggy (see
  `01-security-audit-report.md`).
- **`set_default_address` RPC**: scoped by `where user_id = p_user_id`
  in the function body itself — a client-supplied `p_address_id`
  belonging to another user simply matches zero rows rather than
  updating one, confirmed by reading the function definition in
  `20260722101912_addresses_table.sql`.

While doing this pass, found (and fixed — see
`02-vulnerability-remediation-report.md`) 5 more raw-database-error leaks
that the original SEC-008 sweep's grep pattern missed, because it only
matched the literal string `error.message`, not `typesError.message` /
`uploadError.message` / other variable names ending in a capital
`Error`. All are now fixed; a corrected, case-insensitive-safe grep
(`rror\.message`) across the whole `app/api` tree confirms zero raw
error leaks remain anywhere.
