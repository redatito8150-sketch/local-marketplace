# Security and Reliability Remediation Report — August 10, 2026

## Executive Summary

Seven remediation stages were completed within the repository without applying migrations, writing to a live database, deploying, or committing changes. The highest-risk paths discovered across authentication, authorization, orders, inventory, privacy, and account deletion were addressed. The current code is **not yet ready for production deployment** until the owner action list below is completed against an isolated Staging project and the legal content is finalized.

## Remediations Completed

1. **Database containment:** Neutralized two data-wiping migrations, locked down every known legacy `place_order` overload, and prevented `anon/authenticated` roles from executing order RPCs.
2. **Authentication:** Enforced AAL2/MFA across the web application and APIs, restored the MFA challenge after reloads, and protected mobile auth links with PKCE, single-use state, and an exact allowlist.
3. **Admin authorization and public privacy:** Replaced broad `is_admin` authorization with granular permissions, protected the role hierarchy, and replaced overly broad public reads with safe column and public-interface boundaries.
4. **Order integrity:** Added atomic database-backed idempotency, positive quantity and price validation, server-authoritative pricing, rejection of invalid credentials instead of silently downgrading to guest checkout, an order state machine, and fixes for coupon accounting and post-shipment cancellation.
5. **Warehouse, Storage, and reviews:** Added return-stock reservation, rejected duplicate or omitted receiving lines, made inventory movements idempotent, reconciled buckets and upload policies, locked down the SKU counter, and prevented review owners from editing moderation fields.
6. **Accounts, identity, and mobile:** Added auditable account deletion with retained-PII redaction and a durable Storage cleanup queue, synchronized email changes, protected password recovery, fixed mobile pricing schema drift, and added product- and variant-level discount support.
7. **Remaining application integrity:** Removed draft deletion from GET/RSC rendering and replaced it with recoverable daily archiving, made OTP verification atomic and HMAC-protected without logging codes, fixed default-address integrity, added cross-product catalog constraints, blocked mutations by disabled brands, made owner linking/unlinking atomic, and sanitized Discord/audit output against PII and Markdown injection.

An exact HTTPS allowlist was also added for the mobile API origin, legal consent is now captured with a version and timestamp during mobile registration, and the React Animated issues that blocked mobile linting were fixed.

## Local Verification Results

- Root TypeScript: passed.
- Root ESLint: 0 errors; two pre-existing warnings in `components/reviews/ReviewActions.tsx` concerning `location.href`.
- Root offline tests: 347/347 passed after excluding the two live integration suites.
- Mobile TypeScript: passed.
- Mobile ESLint: passed with no errors.
- Mobile tests: 30/30 passed.
- `git diff --check`: passed.
- Next production build: compilation and TypeScript passed; prerendering later failed at `/new-arrivals` because the current execution environment cannot connect to Supabase.
- Simulated production legal gate: failed as intended because 16 legal placeholders remain unresolved.

The `security.rls.test.ts` and `avatarLinking.test.ts` suites were not run successfully because they require a live Supabase project and perform writes or create users. Attempts from the restricted environment returned `fetch failed` only.

## Owner Actions Required Before Production

### P0 — Deployment Is Prohibited Until Completed

1. Create a verified database backup, followed by a separate **disposable Staging project**. Do not run `supabase db push` directly against Production.
2. Repair migration history and the baseline on Staging. The older migration chain still cannot be reliably rebuilt from an empty database, and the live environment had stopped at a revision older than the files in Git. Extract a reviewed baseline from the live schema, reconcile migration history, and then require a full replay with a zero schema diff.
3. Apply migrations `20260810000002` through `20260810000008` to Staging first. Review logs, row counts, and the rollback plan before any Production application.
4. Run both live integration suites on Staging, followed by concurrency tests for orders, coupons, and warehouse workflows, plus MFA, account deletion, and real-device deep-link tests.
5. Replace all 16 legal placeholders with confirmed values after legal review. The exact list is maintained in `docs/legal-placeholders-todo.md`. The production gate will continue to block deployment until they are resolved.

### Supabase and Storage Configuration

6. Inspect live `pg_proc`, grants, and RLS. Confirm that every sensitive RPC is service-role only, especially every `place_order` overload and the OTP and maintenance routines.
7. Verify live buckets: `brand-application-documents` must be private, `review-images` must carry the new restrictions, and `product-images` must have appropriate MIME, size, and policy configuration.
8. Configure the redirect allowlist with exact URLs only and remove any broad `https://*.vercel.app/auth/callback` entry. Review email confirmation, Secure Email Change, and MFA policies in the Supabase Dashboard.

### Secrets and Operational Infrastructure

9. Configure a long random `CRON_SECRET` in Vercel and verify that `/api/cron/storage-cleanup` runs daily. The task removes queued files and archives expired drafts without deleting them.
10. Set `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_API_ALLOWED_HOST` to the same exact production hostname. The mobile application refuses to send a Bearer token to any other origin.
11. Keep `SMS_VERIFICATION_ENABLED=false` until a real SMS provider is selected. Before enabling it, configure the HTTPS endpoint, provider token, and a random `PHONE_OTP_PEPPER` of at least 32 characters, then test failover and rate limiting.
12. Complete Universal/App Links: publish AASA with the Apple Team ID and `assetlinks.json` with SHA-256 release-certificate fingerprints, add the mobile callback routes to Supabase, then perform a native rebuild and test on iOS and Android devices.
13. Review Discord channel access, retention, and DPA requirements. If Discord has not been approved as an operational destination, leave its webhooks unset; the integration safely becomes a no-op when they are absent.

## Remaining or Unverified Risks

- Migration baseline/history drift remains the largest technical blocker and cannot be repaired safely without the live schema/history and an isolated Staging environment.
- Actual live RLS, grants, and bucket flags cannot be proven from Git alone.
- Supabase, Google, and Vercel settings, as well as association files outside the repository, require manual verification.
- Legal content requires an accountable owner or legal adviser. The code prevents unresolved placeholders from shipping but cannot invent legally valid values.
- The final build must be verified from an environment that can reach the designated Staging Supabase project.

## Repository State

The changes are neither staged nor committed. The pre-existing `.claude/settings.local.json` file was not modified. No deployment, push, or write to Production occurred.
