# Production Audit Corrective Status

**Status date:** 2026-08-21  
**Working branch:** `codex/production-audit-final-corrective`  
**Database status:** no migration in this corrective work was applied to any database  
**Delivery status:** local only; not pushed, merged, or deployed

This is the handoff document for Codex, Claude, and future reviewers. It records what the two corrective migrations and the application changes actually close, what was verified, and what remains a production blocker. It must be read together with the original 2026-08-20 audit backlog.

## Decision

The corrective code is statically consistent and fails closed in the highest-risk refund path, but it is **not approved for production SQL or deployment yet**.

Two runtime gates remain mandatory:

1. Apply the migrations to a disposable Supabase project and run the live RLS, concurrency, accounting, and rollback suite there.
2. Integrate and sandbox-verify a Paymob source that authenticates the exact refunded amount. The ordinary signed transaction callback is not sufficient for this purpose.

## Corrective work completed

### Refund and cancellation integrity

- Staff actions create `payment_refund_requests`; they do not mark money as refunded.
- Immutable provider events live in `payment_refunds` and are allocated through `payment_refund_allocations`.
- An allocation must match the same captured payment and the exact requested amount.
- Ambiguous equal-value matches stop for explicit Admin allocation instead of guessing.
- Allocation reversal is durable, reasoned, and forbidden after cancellation/restocking.
- Card cancellation stays blocked while the payment is `paid` or `partially_refunded`; only a fully confirmed refund unlocks it.
- Customer Account, Admin Dashboard, and Brand Portal read the same pending/confirmed refund state.
- The ordinary Paymob transaction callback treats `is_refunded` as an operational observation only. It does not change order, refund, or stock state because its signed `amount_cents` is the original transaction amount, not proof of the exact partial-refund amount.

**Remaining blocker:** no production application route currently creates an exact provider refund event. Refund requests therefore remain safely pending until a separately verified Paymob API/event ingestion path is implemented and sandbox-tested.

### Coupon accounting

- Card coupon reservation conversion now occurs inside the same database transaction as paid-order fulfillment.
- COD admission and active card reservations participate in the same `max_uses` guard.
- Existing redemptions are backfilled and `coupons.used_count` is recomputed from canonical records.
- Replay/concurrency integration scenarios are executable in the disposable-project suite.

### Account deletion and financial retention

- Payment creation and account deletion serialize on the same profile row lock.
- Financial rows survive auth-user deletion through nullable `ON DELETE SET NULL` actor/payer references.
- Personal snapshots are redacted before the auth identity is removed.

### Authorization and connected surfaces

- Brand Portal impersonation uses a path-to-permission matrix.
- Limited staff cannot inherit unrestricted Admin behavior through Brand Portal routes.
- Full Admin, limited staff, Brand Owner, and assistant behavior is covered by repository safety tests.

### Inventory, lifecycle, and application deletion

- Archived-product stock restoration is limited to named canonical flows using a transaction-local flag.
- Paid-order cancellation cannot restock before a full verified refund.
- Brand Application deletion writes its required audit row and queues Storage cleanup in the same database transaction.

### Upload hardening

- Image uploads are decoded and re-encoded; filenames, MIME claims, double extensions, and trailing polyglot payloads are not trusted.
- Brand Application PDFs are parsed and rebuilt.
- PDFs containing document `OpenAction`, page `AA`, JavaScript, Launch, rich-media, embedded-file, form-submit, import, or external navigation actions are rejected before copying.
- Page annotations and page additional actions are removed again as defense in depth.
- Admin document access remains attachment-only with `nosniff` and a restrictive CSP.

### Live-test and CI safety

- Live Supabase suites use one shared loader.
- Writes require `RUN_LIVE_RLS=1`, an exact `RUN_LIVE_RLS_ALLOWED_PROJECT_REF`, and matching credentials.
- The known production project ref is hard-denied.
- `process.env` works in CI; `.env.local` is only a local fallback after explicit opt-in.
- Cleanup failures fail the live suite instead of being ignored.
- The ordinary CI job receives no service-role key.
- A manually dispatched, separately scoped job exists for a configured disposable Supabase project.

## Verification completed

- TypeScript: clean.
- ESLint: clean after the final PDF hardening and tests.
- Full repository tests: `1148` total, `1079` passed, `0` failed, `69` skipped.
- The skipped tests are live/database-gated; they were not counted as runtime proof.
- Corrective repository-safety and upload-security tests: clean.
- `git diff --check`: clean.

The production build compiled and completed TypeScript/page-data collection setup, then stopped while prerendering `/new-arrivals` because this isolated worktree has no usable Supabase data source. Dummy credentials were used only to prove compilation; no production credential was borrowed. The existing legal-content validator also reports 16 unresolved legal placeholders, but does not currently block builds.

## Required migration order

If and only if the runtime blockers above are cleared, apply in this exact order:

1. `supabase/migrations/20260820000001_production_audit_corrective_fixes.sql`
2. `supabase/migrations/20260821000000_production_audit_corrective_pass_2.sql`

Then run the live integration suite against the migrated disposable project before any production SQL.

## Original audit items still not closed by this corrective scope

The following original backlog IDs still require separate implementation or runtime verification and must not be silently treated as fixed:

- Payments: `PAY-01`, `PAY-04`, `PAY-05`, `PAY-07`, `PAY-08`
- Product/database/inventory: `PROD-01`, `DB-02`, `DB-03`, `DB-H01`, `INV-01`, `INV-02`, `INV-03`
- Documents/storage/web/notifications/privacy/performance: `DOC-01`, `STOR-01`, `WEB-01`, `WEB-02`, `NOTIFY-01`, `NOTIFY-02`, `PRIV-01`, `PERF-01`
- Mobile/accessibility/CI: `MOB-01`, `A11Y-01`, `MOB-I01`, `MOB-CI-01`
- Production runtime verification: `CFG-01`

`PDF-01` is closed by this pass and must be removed from older “still open” lists.

## Prohibited shortcuts

- Do not treat a staff-entered reference, screenshot, note, or the transaction callback's `is_refunded` flag as exact refund proof.
- Do not point live write tests at production.
- Do not apply either migration out of order.
- Do not merge or deploy application code that depends on the migrations before the disposable-database suite passes.
- Do not claim skipped tests as passed runtime coverage.
