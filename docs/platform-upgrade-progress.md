# Mahaly Platform Upgrade Progress

Last updated: 2026-07-22

## Current phase

Phase 1 — repository, runtime, data-model, and security audit. The baseline inventory and first security pass are complete; database privilege verification and end-to-end flow verification remain in progress.

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

None yet. The audit has identified required privilege/RLS changes, but no migration will be written until the live grants and schema drift are verified.

## Security fixes

None applied in the audit-only checkpoint. Confirmed findings and proposed fixes are tracked in `docs/security-audit.md`.

## Tests performed

- Repository and route inventory.
- Static authorization/service-role scan.
- RLS and PostgreSQL function scan.
- Public API route classification.
- `npm audit --json` with registry access.

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
