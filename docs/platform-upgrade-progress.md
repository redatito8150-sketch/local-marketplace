# Mahaly Platform Upgrade Progress

Last updated: 2026-07-22

## Current phase

Phase 2 — security-critical boundary fixes. The baseline audit is documented; the first RPC/RLS and checkout hardening changes are implemented locally and awaiting migration/preview verification.

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

## Pending tasks

- Verify live database function grants, policies, indexes, and schema drift read-only against the connected Supabase project.
- Revoke public execution from privileged database functions while preserving required server and policy behavior.
- Restrict public product reads to published, non-paused records and review public brand column exposure.
- Harden order creation, variant resolution, quantity limits, product visibility checks, validation, rate limiting, and safe error handling.
- Harden storage upload namespaces and file-content verification.
- Add a real automated test foundation and security regression tests.
- Complete all customer, brand-owner, and admin flow verification.
- Refactor shared validation/authorization boundaries incrementally.
- Redesign brand pages using real brand data.
- Design and implement the typed visual CMS, draft/publish workflow, preview, history, restoration, and audit logs.
- Add the homepage marketplace preview and `/shop/all` catalog.
- Complete responsive QA, preview verification, PR review, and final merge.

## Files changed

- `docs/platform-upgrade-progress.md`
- `docs/full-platform-audit.md`
- `docs/security-audit.md`

## Database changes

- Added `supabase/migrations/20260722_security_boundaries.sql` (not applied to production yet).
- The migration revokes public execution from privileged mutation/trigger functions and narrows product/variant SELECT policies.
- Rollback requires restoring the previous policies and function grants; no table rows or columns are deleted.

## Security fixes

- Implemented code and migration fixes for SEC-001, SEC-002, and SEC-003; deployment verification remains pending.
- Added stable public checkout errors and request abuse caps.

## Tests performed

- Repository and route inventory.
- Static authorization/service-role scan.
- RLS and PostgreSQL function scan.
- Public API route classification.
- `npm audit --json` with registry access.
- Eight order-request validation tests: all passing.
- TypeScript and lint after the first security implementation: lint passes; final TypeScript rerun pending after test-runner compiler configuration.

Baseline TypeScript, lint, production build, and runtime flow tests are pending for this phase.

## Known limitations

- The checked-in `supabase/schema.sql` is cumulative while only one file exists in `supabase/migrations`; deployment history and schema drift are not yet reproducible from migrations alone.
- No second customer or second brand-owner test identity has yet been used, so cross-account and cross-brand isolation are not fully runtime-verified.
- Payment processing is not integrated; the checkout UI currently presents card fields but order creation is not backed by a payment provider.
- The in-memory rate limiter is not distributed across Vercel instances.

## Rollback notes

- This checkpoint changes documentation only.
- Future database migrations must be additive and include explicit down/rollback instructions.
- Security privilege changes will preserve service-role access and will be validated in preview before production merge.
- All implementation remains isolated on `feature/platform-audit-visual-cms-brand-experience` until final checks pass.
