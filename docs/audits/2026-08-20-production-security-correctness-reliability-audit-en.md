# Production Security, Correctness, and Reliability Audit

**Audit date:** 2026-08-20

**Audit status:** Findings and corrective plan only; no fixes were implemented as part of this audit.

**Reviewed branch:** `codex/product-deletion-corrective-pass`

**Reviewed commit:** `1d60f205804b334e7e7acaa84db1847e75b101b5`

**Upstream state at audit time:** `0` ahead / `0` behind
**Decision:** **Unsafe for production**

> This document is the canonical corrective backlog produced by the 2026-08-20 read-only audit.
> Before changing payments, orders, account deletion, product lifecycle, inventory, warehouse,
> Brand Portal authorization, uploads, notifications, or CI, read the relevant finding and its
> dependency order below. Treat Admin Dashboard, Brand Portal, customer web, mobile, API routes,
> database functions, history, and notifications as one connected system.

## A. Executive decision

The reviewed revision is **unsafe for production** because four confirmed payment defects can create
captured-but-unfulfilled payments, paid orders cancelled without a refund obligation, or a refund
queue that reports that zero is owed when money was captured.

Production card checkout, paid-order cancellation, and manual refund handling must not be treated as
safe until the payment blockers in this report have been corrected, reconciled against provider data,
and verified in an isolated Paymob sandbox and disposable Supabase environment.

## B. Repository safety statement

At the end of the audit:

- No tracked or staged file changes were present.
- The only pre-existing untracked path was `.impeccable/`; it was preserved.
- `git diff --check` was clean.
- No branch, commit, push, merge, deployment, package installation, or SQL migration was created or
  performed for the audit.
- No secret value was printed or copied.
- Root TypeScript and ESLint checks passed.
- The root test run reported `1052 passed`, `0 failed`, and `43 skipped`.
- Mobile tests reported `27 passed` and `1 failed`; the failure was caused by missing local Expo
  dependencies. Mobile TypeScript/lint could not be proven for the same environment reason.
- A production build and dependency audit were deliberately not run because they could write output
  or require network access.

### Important test-safety incident

The audit cannot truthfully confirm that the configured Supabase project was untouched. Before the
test design was fully understood, the ordinary root `npm test` command was run. The repository has
three suites that automatically read the gitignored `.env.local`, create live fixtures through the
service role, and do not require an explicit live-test opt-in:

- `tests/avatarLinking.test.ts`
- `tests/crossTenantIsolation.test.ts`
- `tests/security.rls.test.ts`

The tests passed and their cleanup blocks ran, but some cleanup results are ignored or unchecked.
Consequently, residue cannot be ruled out without a separately approved inspection of the configured
project. Potential fixture prefixes are:

- `test-avatar-*`
- `zz-isolation-*`
- `test-brand-*`
- `test-product-*`

No follow-up database connection was made after this risk was discovered.

## C. Critical and High findings

| ID | Severity | Confidence | Summary |
| --- | --- | --- | --- |
| PAY-01 | Critical | Confirmed | Checkout is returned even if the local Paymob provider linkage fails to persist. |
| PAY-02 | Critical | Confirmed | Account deletion can erase an open payment attempt or fail after a completed card payment. |
| PAY-03 | Critical | Confirmed | Admin/Brand cancellation can restock a captured card order without creating a refund obligation. |
| PAY-04 | Critical | Confirmed | Failed fulfillment buckets are recorded with a zero expected refund amount. |
| AUTH-01 | High | Confirmed | Limited Admin permissions can be bypassed through Brand Portal impersonation and brand APIs. |
| TEST-01 | High | Confirmed | Ordinary tests can mutate a real Supabase project while CI can silently skip the intended live RLS coverage. |
| CI-01 | High, conditional | High confidence | The Supabase service-role secret is exposed job-wide, including during dependency installation. |
| APP-01 | High | Confirmed | Application deletion is non-transactional and leaves private legal documents in Storage. |
| PROD-01 | High | Confirmed | Product publishing is non-atomic and can expose an incomplete product. |
| PROD-02 | High | Confirmed | Archived products can acquire new stock or warehouse requests. |
| PAY-05 | High | Confirmed | Partial fulfillment becomes terminal and cannot use its documented retry path. |
| PAY-06 | High | Confirmed | Card coupon admission is raceable and can exceed `max_uses`. |
| PAY-07 | High | Confirmed | Shipping totals are recalculated from live settings after card capture. |
| PAY-08 | High, conditional | Runtime verification required | A later success may not recover an attempt already recorded as declined. |
| PAY-09 | High | Confirmed | Manual refund recording can mark a clean payment as refunded while related orders remain Paid. |
| WH-01 | High | Confirmed | Warehouse staff can bypass CRN controls and directly alter sellable stock. |
| WH-02 | High | Confirmed | Brand assistants can request stock returns even though inbound requests are owner-only. |
| WH-03 | High | Confirmed | A legacy receipt payload bypasses the immutable receipt/correction history. |

## D. Full findings

Impact flags used below:

- **D:** data loss
- **F:** financial mismatch
- **S:** stock corruption or stranded stock
- **U:** unauthorized access
- **P:** privacy leakage
- **X:** duplicate/ambiguous processing
- **V:** storefront or cross-surface inconsistency

### Authentication and permissions

#### AUTH-01 — Limited Admin permission bypass through Brand Portal

- **Severity / confidence:** High / Confirmed
- **Evidence:** `lib/admin/permissionPolicy.ts:117-129` applies granular permissions only to
  `/admin*` and `/api/admin*`. `lib/supabase/brandAuth.ts:51-64,155-214` treats any
  `profiles.is_admin=true` user as eligible to impersonate an arbitrary brand. Sensitive examples
  include `app/api/brand-portal/orders/export/route.ts:7-35`,
  `app/api/brand-portal/orders/[id]/status/route.ts:22-64`,
  `app/api/brand-portal/orders/[id]/cancel/route.ts:18-45`, and
  `app/api/brands/[slug]/inline-edit/route.ts:37-52,190-211`.
- **Affected actors/surfaces:** Limited custom-role staff, Full Admin, Admin impersonation, Brand
  Portal, brand APIs, customer/order exports, catalog, inventory, analytics, and audit data.
- **Root cause and reachable path:** A limited employee still has `is_admin=true`; they select an
  arbitrary `brandSlug`; `requireBrandOwner()` returns an owner-level impersonation context; service-
  role reads/writes then execute without the employee's granular permission being checked.
- **Impact:** A staff member intended only for analytics or another narrow function can read customer
  PII, export orders, inspect unrelated brands, edit brand content, cancel orders, or advance order
  state. **Flags:** U, P, F, S.
- **Safe reproduction:** In a disposable project, assign only `view_analytics` to an admin-profile
  user and exercise every Brand Portal read/export/write API for an unrelated brand.
- **Recommended fix:** Centralize a `requireBrandPortalContext({ permission, allowImpersonation })`
  guard. Map every Brand Portal page/API to a granular permission. Make impersonation server-side
  read-only by default. Require `manage_brands` for `/api/brands/**` administrative mutations.
- **Migration / backfill:** No migration is required for the primary route fix; a database backstop is
  recommended. No backfill.
- **Rollout risk:** Existing recovery/impersonation tools may stop working until read-only and write
  capabilities are separated.
- **Required tests:** Full Admin, limited staff, Brand Owner, assistant, unrelated owner, and
  impersonating Admin against every read/export/write route.

#### AUTH-H01 — Password recovery state is not a proven security boundary

- **Status:** Hypothesis, not a confirmed exploit.
- **Evidence:** `app/reset-password/page.tsx:29-73` uses a client-writable `sessionStorage` marker before
  calling `updateUser`. Password inputs also accept six characters at
  `app/reset-password/page.tsx:54-56,99-117` and `app/account/page.tsx:195-196`.
- **Runtime dependency:** Exploitability depends on Supabase Secure Password Change and
  reauthentication settings, which were not available to the static audit.
- **Recommendation:** Verify the live Supabase policy, require a server-verifiable recovery state,
  and raise password requirements after compatibility review.

### Database, RLS, and migrations

#### DB-01 — Deletion preflight misses wrong-Variant and correction references

- **Severity / confidence:** Medium / Confirmed
- **Evidence:** `supabase/migrations/20260819120000_paused_status_and_delete_first_lifecycle.sql:413-425`
  counts warehouse history through `warehouse_transfer_items.variant_id`, while receipt/correction
  history also retains `expected_variant_id`, `actual_variant_id`, `from_variant_id`, and
  `to_variant_id` in
  `supabase/migrations/20260817192829_warehouse_receipts_and_corrections.sql:107-130,181-207`.
- **Affected surfaces:** Product deletion UI/RPC, immutable warehouse history, Admin and Brand Portal.
- **Failure path:** A product Variant appears only as an actually received substitution or correction
  Variant. Preflight reports permanent deletion as allowed, but the final delete hits an FK restrict.
- **Impact:** Misleading deletion eligibility and a failed terminal operation. **Flags:** V.
- **Safe reproduction:** Disposable DB with a Variant referenced only as `actual_variant_id` or
  `to_variant_id`.
- **Fix:** Include every expected/actual/from/to reference in immutable-history counts and eligibility.
- **Migration / backfill:** SQL required; no data rewrite.
- **Rollout risk:** Low; eligibility can become more restrictive for legitimately historical products.
- **Tests:** Substitution, damaged-only receipt, correction references, and preflight/delete agreement.

#### DB-02 — Opposite lock orders can deadlock lifecycle and inventory operations

- **Severity / confidence:** Medium / Confirmed
- **Evidence:** Lifecycle functions lock products before Variants at
  `20260819120000_paused_status_and_delete_first_lifecycle.sql:679-716,984-1016,1196-1223`.
  Adjustments, receipts, and corrections lock Variants before touching products at
  `20260815213740_product_launch_policy_and_opening_stock.sql:766-788,867-871` and
  `20260817192829_warehouse_receipts_and_corrections.sql:520-560,870-894,965-973`.
- **Affected surfaces:** Archive/resume/delete/restore, direct stock adjustment, warehouse receipts,
  corrections, Admin and Brand Portal.
- **Failure path:** Concurrent lifecycle and stock operations acquire opposite locks.
- **Impact:** PostgreSQL aborts one operation as a deadlock victim, causing intermittent operational
  failure. Silent stock corruption was not established. **Flags:** S, V.
- **Safe reproduction:** Two-session disposable-DB tests for every conflicting pair.
- **Fix:** Adopt one documented hierarchy, for example brand -> sorted products -> documents ->
  sorted Variants. Add bounded retries only after the hierarchy is fixed.
- **Migration / backfill:** SQL required; no backfill.
- **Rollout risk:** Medium because many canonical functions must change together.
- **Tests:** Archive/receive, delete/correct, and resume/adjust concurrency pairs.

#### DB-03 — Duplicate launch-policy migration

- **Severity / confidence:** Medium operational / Confirmed
- **Evidence:** The following files are nearly identical:
  `supabase/migrations/20260815000000_product_launch_policy_and_opening_stock.sql` and
  `supabase/migrations/20260815213740_product_launch_policy_and_opening_stock.sql`. Both contain an
  `ACCESS EXCLUSIVE` inventory-movement lock around lines 197-223.
- **Impact:** Fresh environments repeat large DDL/backfill work and migration provenance is unclear.
- **Safe reproduction:** Replay the full chain only on a disposable empty database and compare the
  resulting schema and timings.
- **Fix:** Never delete or rewrite an already-applied migration. Inspect the remote ledger first, then
  document the duplicate and use forward-only repair migrations.
- **Migration / backfill:** No data backfill; forward repairs may be required.
- **Rollout risk:** High if history is rewritten; low if handled forward-only.

#### DB-04 — Live products can transition to other pre-live states through an internal write

- **Severity / confidence:** Medium / Confirmed defense gap
- **Evidence:** `20260819120000_paused_status_and_delete_first_lifecycle.sql:131-166` blocks
  Published/Paused -> Draft but not Published/Paused -> `pending_review` or `changes_requested`.
- **Reachability:** No normal unprivileged route was found; this is a service-role/internal-write
  backstop gap.
- **Impact:** A direct internal update can hide a live product outside the canonical Pause flow.
- **Fix:** Classify all pre-live states and reject every live -> pre-live transition except through an
  explicitly sanctioned RPC.
- **Migration / backfill:** SQL required; no backfill.
- **Tests:** Direct service-role transition matrix.

#### DB-H01 — Mutable search paths and an obsolete service-role RPC

- **Status:** Lower-priority hardening; no untrusted schema-creation path was confirmed.
- **Evidence:** Relevant service-role functions still use `public, pg_temp` at
  `20260815213740_product_launch_policy_and_opening_stock.sql:652-718,729-892`.
  `replace_product_with_variants` remains at
  `20260730000007_replace_product_with_variants.sql:15-87`.
- **Recommendation:** Fully qualify objects, use `search_path=''`, and retire the obsolete RPC only
  after dependency review.

### Product lifecycle and storefront visibility

#### PROD-01 — Publishing is not atomic

- **Severity / confidence:** High / Confirmed
- **Evidence:** Admin create writes the product, options, Variants, color links, and media separately at
  `app/api/admin/products/route.ts:91-152`. Brand Portal repeats the sequence at
  `app/api/brand-portal/products/route.ts:101-165`. The canonical predicate at
  `20260819120000_paused_status_and_delete_first_lifecycle.sql:85-98` does not require an active
  Variant or catalog completeness.
- **Affected actors/surfaces:** Admin, Brand Owner, storefront, search, New Arrivals, wishlist,
  notifications, checkout, and database timestamps.
- **Failure path:** A `published/show_now` product row succeeds; a later Variant or media write fails;
  the request returns an error while the base product is already customer-visible.
- **Impact:** Broken or Variant-less products can appear publicly and `first_visible_at` can be stamped
  prematurely. **Flags:** V, D.
- **Safe reproduction:** Dependency-injected failure after every child write, then a disposable-DB
  visibility query.
- **Fix:** Perform the whole product graph write transactionally, or keep the product non-live until a
  final row-locked publish RPC validates completeness and switches status.
- **Migration / backfill:** SQL and application changes required. Audit existing Published products
  for required fields, at least one active non-archived Variant, and valid media/option relations.
- **Rollout risk:** High; deploy SQL before dependent application code.
- **Tests:** Failure injection, crafted status updates, scheduled/`when_stocked`, and the full actor
  matrix.

#### PROD-02 — Archived products can acquire stock or warehouse requests

- **Severity / confidence:** High / Confirmed
- **Evidence:** Archive checks stock/documents only at that instant in
  `20260819120000_paused_status_and_delete_first_lifecycle.sql:430-514,821-825`. Direct adjustment
  does not recheck parent lifecycle status at
  `20260815213740_product_launch_policy_and_opening_stock.sql:766-788`. Partner transfer creation has
  the same omission at `20260814010500_partner_replenishment_request.sql:141-166`.
- **Affected surfaces:** Admin inventory, Brand Portal inventory/warehouse, product archive, ledger,
  storefront availability, and reports.
- **Failure path:** Archive a zero-stock product, then submit an adjustment or transfer using a retained
  Variant UUID; archive and adjustment can also race.
- **Impact:** A terminal Archived product can regain stock or open operational documents. **Flags:** S,
  V.
- **Safe reproduction:** Disposable DB with direct/partner requests and a two-session archive race.
- **Fix:** Every stock/request entry point must lock and recheck canonical parent status. Define a
  Draft/Published/Paused/Archived matrix with a narrow historical-correction exception.
- **Migration / backfill:** SQL required. Audit Archived products with quantity, open transfers, brand
  stock, or post-archive movements.
- **Rollout risk:** Medium; historical correction tooling needs an explicit exception.
- **Tests:** Direct/partner actor matrix and race tests.

#### PROD-03 — Scheduled `first_visible_at` can be almost one hour late

- **Severity / confidence:** Medium / Confirmed
- **Evidence:** Visibility starts when `publish_date <= now()` at
  `20260819120000_paused_status_and_delete_first_lifecycle.sql:85-98`, but activation runs hourly in
  `20260815214231_product_visibility_activation_cron.sql:12-16` and stamps `now()` at
  `20260815213740_product_launch_policy_and_opening_stock.sql:609-625`.
- **Impact:** New Arrivals ordering/window can be skewed by nearly one hour. **Flags:** V.
- **Fix:** Stamp the actual eligibility instant for pure schedule expiry; retain `now()` when another
  gate genuinely clears later.
- **Migration / backfill:** SQL required. Backfill only after distinguishing cron delay from genuine
  late stock/brand/transition eligibility.
- **Tests:** Schedule boundary, missed cron, `when_stocked`, and New Arrivals ordering.

#### PROD-04 — Archived records remain mutable through Show Now and collections

- **Severity / confidence:** Medium / Confirmed
- **Evidence:** Show Now has no status allowlist at
  `20260815213740_product_launch_policy_and_opening_stock.sql:1152-1189`. Collection assignment
  explicitly includes Archived products at
  `app/api/brands/[slug]/collections/[id]/products/route.ts:27-44,72-109`.
- **Impact:** Terminal history changes and launch policy can affect later restore behavior. **Flags:** V.
- **Fix:** Allow Show Now only for explicitly supported live states and define whether Archived
  collection metadata is immutable.
- **Migration / backfill:** SQL backstop and application changes; audit archived-row changes if history
  supports it.
- **Tests:** Crafted Admin/Owner calls against every lifecycle state.

### Inventory and warehouse accounting

#### WH-01 — Legacy direct correction bypasses CRN governance

- **Severity / confidence:** High / Confirmed
- **Evidence:** `app/api/admin/warehouse/corrections/route.ts:116-148` accepts a branch without
  `transferId`. `20260814000001_stock_ledger_locations.sql:80-132` directly updates stock and
  movements without a CRN, source-bucket bound, or independent approval.
- **Affected actors/surfaces:** Delegated warehouse receiver, Full Admin, Brand Portal history,
  sellable stock, audit trail, and reports.
- **Failure path:** A receiver submits `variantId`, `delta`, and `reason` instead of a transfer-linked
  CRN.
- **Impact:** Sellable stock can be fabricated or removed without four-eyes review or brand-visible
  parity. **Flags:** S, U.
- **Safe reproduction:** Crafted API request against a disposable DB using a receiver role.
- **Fix:** Remove the fallback and require CRN v2 for every warehouse correction. Revoke/retire the
  legacy RPC.
- **Migration / backfill:** SQL required. Audit legacy correction movements and reconcile/synthesize
  CRNs where evidence is sufficient.
- **Rollout risk:** Medium; migration/import tooling may still depend on the old function.
- **Tests:** Receiver/Admin role matrix, direct API rejection, and brand-visible history.

#### WH-02 — Assistants can request stock returns

- **Severity / confidence:** High / Confirmed
- **Evidence:** Inbound transfer checks `accessLevel === 'owner'` at
  `app/api/brand-portal/warehouse/transfers/route.ts:19-22`. The return route omits that check at
  `app/api/brand-portal/warehouse/returns/route.ts:17-20`. The return RPC immediately reduces sellable
  stock at `20260814000003_warehouse_documents.sql:315-343`.
- **Affected actors/surfaces:** Brand Owner, assistant, Brand Portal, storefront availability, Admin
  warehouse, and ledger.
- **Failure path:** An assistant calls or opens the return endpoint.
- **Impact:** Unauthorized stock reservation removes customer availability. **Flags:** U, S, V.
- **Safe reproduction:** Disposable owner/assistant route tests.
- **Fix:** Enforce owner-level permission server-side and in the UI, or introduce an explicit
  return-stock capability.
- **Migration / backfill:** Route fix requires no SQL. Audit returns created by assistants and release
  unauthorized reservations safely.
- **Rollout risk:** Low.
- **Tests:** Owner, assistant, unrelated owner, and impersonating Admin.

#### WH-03 — Legacy inbound receipt bypasses immutable receipt history

- **Severity / confidence:** High / Confirmed
- **Evidence:** V2 is selected only when a V2-specific field exists at
  `app/api/admin/warehouse/transfers/[id]/receive/route.ts:50-60`. Idempotency is V2-only at lines
  92-99, and the legacy RPC is called at lines 116-129. The old path mutates stock without
  `warehouse_receipts`/receipt lines in
  `20260815213740_product_launch_policy_and_opening_stock.sql:905-1137`.
- **Affected surfaces:** Admin receipt, Brand Portal records, GRN/CRN, wrong Variant, ledger, and audit.
- **Failure path:** A crafted inbound request sends only `receivedOkQty`, `damagedQty`, and
  `missingQty`.
- **Impact:** Stock commits through a parallel history model that cannot support the current CRN and
  parity workflow. **Flags:** S, V, X.
- **Safe reproduction:** Crafted legacy payload against a disposable transfer.
- **Fix:** Force every `to_local` receipt through V2 with a required operation key; retire the legacy
  overload for inbound use.
- **Migration / backfill:** Route rejection can ship without SQL; retiring the overload needs SQL.
  Identify post-V2 legacy receipts and synthesize immutable records only after reconciliation.
- **Rollout risk:** Medium because older clients/scripts may still send the old payload.
- **Tests:** Legacy rejection, replay, wrong Variant, partial receipt, and Admin/Brand history parity.

#### INV-01 — Adjustment idempotency is scoped per Variant, not per request

- **Severity / confidence:** Medium / Confirmed
- **Evidence:** Replay uses `(variant_id, source_operation_key)` at
  `20260815213740_product_launch_policy_and_opening_stock.sql:794-805`, while Admin and Brand routes
  submit one key for a multi-Variant request.
- **Failure path:** Request key K adjusts A; a changed retry K containing A+B replays A and applies B.
- **Impact:** Mutated retries partially apply instead of conflicting. **Flags:** S, X.
- **Fix:** Store one operation row keyed by actor/brand/key with a canonical payload hash and stored
  response.
- **Migration / backfill:** SQL required; audit reused keys if practical.
- **Tests:** Reordered, expanded, reduced, and amount-mutated retries.

#### INV-02 — Duplicate resolved Variants can distort cancellation ledger snapshots

- **Severity / confidence:** Medium / Confirmed
- **Evidence:** Request duplicate keys are case-sensitive at `lib/orders/orderRequest.ts:59-87`, while
  resolution normalizes comparisons at `app/api/orders/route.ts:220-232`. Cancellation restocks each
  item at `20260812000006_master_orders.sql:529-543`; the status trigger reads final quantity for each
  item at `20260803000001_opening_stock_inventory_workflow.sql:319-347`.
- **Impact:** Final stock is restored, but multiple movement rows can carry identical before/after
  snapshots instead of a sequential chain. **Flags:** S, X.
- **Fix:** Normalize and aggregate by resolved Variant ID; write movement snapshots with each actual
  stock update.
- **Migration / backfill:** SQL recommended for a resolved-Variant invariant and trigger repair.
- **Tests:** Casing duplicates and cancellation ledger reconciliation.

#### INV-03 — Cancellation Variant locks are nondeterministic

- **Severity / confidence:** Medium / Confirmed
- **Evidence:** `20260812000006_master_orders.sql:529-539` loops and updates Variants without ordered
  prelocking.
- **Impact:** Concurrent cancellations with shared Variants in opposite item order can deadlock. No
  silent stock corruption was established. **Flags:** S.
- **Fix:** Prelock all affected Variant rows in a deterministic UUID order.
- **Migration / backfill:** SQL required; no backfill.
- **Tests:** Concurrent reversed-order cancellations.

### Orders, checkout, and payments

#### PAY-01 — Paymob checkout can proceed without durable provider linkage

- **Severity / confidence:** Critical / Confirmed
- **Evidence:** `lib/payments/createIntentionForCart.ts:336-357` returns the checkout secret even if
  `markIntentionCreated` fails. `lib/payments/paymob.ts:151-159` accepts missing intention/order IDs as
  `''` and `0`. `app/api/payments/paymob/webhook/route.ts:66-78` finds attempts only by
  `provider_order_id`, and `lib/payments/processPaymobWebhook.ts:66-74` rejects unmatched payments.
- **Affected actors/surfaces:** Customer checkout, Paymob, webhook, orders, Admin payments, fulfillment,
  refunds, stock, and customer support.
- **Failure path:** Paymob creates an intention; local persistence fails or the 2xx response lacks IDs;
  the client receives a valid checkout secret; payment succeeds; the signed webhook cannot find the
  attempt.
- **Impact:** Captured money without an order, fulfillment, or reliable local refund trail. **Flags:**
  F, D, V.
- **Safe reproduction:** Dependency-injected unit test where provider creation succeeds and local
  persistence throws; no network is required.
- **Fix:** Fail closed until linkage is durable; require a non-empty intention ID and positive order ID;
  add provider reconciliation keyed by `special_reference`.
- **Migration / backfill:** SQL required. Reconcile provider transactions against local attempts.
- **Rollout risk:** Very high; schema/reconciliation path must precede checkout code.
- **Tests:** Every persistence crash boundary, malformed 2xx responses, webhook recovery, replay, and
  provider reconciliation.

#### PAY-02 — Account deletion can erase or conflict with payment attempts

- **Severity / confidence:** Critical / Confirmed
- **Evidence:** `app/api/account/delete/route.ts:54-69` deletes the auth user without checking payment
  state. `20260811000001_payment_attempts.sql:24-27` cascades attempts on auth-user deletion. Orders
  and webhook events later reference attempts without cascade at
  `20260812000001_paymob_webhook_and_paid_fulfillment.sql:37-43,70-73`.
- **Affected actors/surfaces:** Customer account deletion, Paymob webhook, Admin payments, orders,
  privacy retention, and support.
- **Failure paths:** Deletion before webhook erases the attempt and causes a later success webhook to
  miss. Deletion after order/event creation can fail because the cascading attempt deletion is blocked
  by those references.
- **Impact:** Captured-but-orphaned payment or failed account deletion. **Flags:** F, D, P.
- **Safe reproduction:** Disposable DB tests at every attempt state; no provider call is required.
- **Fix:** Block deletion while payment attempts are nonterminal. Preserve and anonymize financial
  audit rows instead of cascade-deleting them; use a nullable/durable payer reference.
- **Migration / backfill:** SQL required. Audit failed deletions and provider transactions without
  attempts.
- **Rollout risk:** High because privacy deletion and statutory financial retention must be reconciled.
- **Tests:** Created, pending, paid-before-fulfillment, fulfilled, failed, expired, and refunded states.

#### PAY-03 — Paid card cancellation has no refund obligation

- **Severity / confidence:** Critical / Confirmed
- **Evidence:** Admin cancellation routes call `cancel_order` without payment checks at
  `app/api/admin/orders/[id]/route.ts:80-92` and
  `app/api/admin/master-orders/[id]/cancel/route.ts:13-29`. Brand cancellation does the same at
  `app/api/brand-portal/orders/[id]/cancel/route.ts:39-45`.
  `20260812000006_master_orders.sql:498-568` restores stock and cancels the order without touching
  payment/refund state. Customer cancellation correctly rejects card/paid orders at
  `20260814005651_unified_order_lifecycle.sql:235-247`.
- **Affected actors/surfaces:** Full Admin, limited staff through AUTH-01, Brand Owner, customer,
  inventory, refund queue, reports, and Paymob.
- **Failure path:** Admin or Brand cancels a captured card order before shipment.
- **Impact:** The customer remains charged, stock is credited for resale, and no refund obligation is
  created. **Flags:** F, S, V.
- **Safe reproduction:** Disposable DB with a paid card order, then actor-matrix cancellation.
- **Fix:** Enforce payment-state handling inside the canonical cancellation RPC. Paid-card cancellation
  must be rejected or atomically create a refund obligation and refund-pending order state.
- **Migration / backfill:** SQL required. Reconcile every cancelled card order with a paid attempt and
  no recorded refund.
- **Rollout risk:** High; UI, APIs, reports, notifications, and accounting must change together.
- **Tests:** Actor matrix, group cancellation, partial group, stock-once, refund state, and cross-surface
  presentation.

#### PAY-04 — Failed buckets record a zero refund amount

- **Severity / confidence:** Critical / Confirmed
- **Evidence:** `20260815213740_product_launch_policy_and_opening_stock.sql:2481-2489` inserts failed
  buckets with `expected_amount_cents=0`. The field is documented as authoritative at
  `20260811000001_payment_attempts.sql:142-151`. Refund summary sums the zero-valued failed row at
  `20260812000001_paymob_webhook_and_paid_fulfillment.sql:588-595`, preventing the full-attempt
  fallback.
- **Affected surfaces:** Paymob fulfillment, Admin refund queue/detail, customer funds, accounting,
  reports, and support.
- **Failure path:** A full or partial bucket fails after capture.
- **Impact:** The refund queue can report that EGP 0 is owed and a real refund can be missed. **Flags:**
  F, D.
- **Safe reproduction:** Disposable DB fulfillment failure with known bucket amounts.
- **Fix:** Persist authoritative per-bucket amounts before checkout and require the sum to equal the
  attempt amount. Reject/flag zero-valued failed buckets.
- **Migration / backfill:** SQL required. Recalculate all failed/partial bucket amounts and manually
  reconcile refund handling.
- **Rollout risk:** Very high because historical money cannot be inferred from current prices/settings.
- **Tests:** Full failure, partial failure, discounts, delivery fees, rounding, and sum invariants.

#### PAY-05 — Partial fulfillment is terminal

- **Severity / confidence:** High / Confirmed
- **Evidence:** `20260815213740_product_launch_policy_and_opening_stock.sql:2258-2264` short-circuits
  both `fulfilled` and `fulfillment_failed`; lines 2504-2519 mark the whole attempt `fulfilled` when any
  bucket succeeds. `lib/payments/processPaymobWebhook.ts:98-105` expects repeated webhook delivery to
  retry fulfillment.
- **Impact:** A transiently failed bucket is permanently omitted and forced to manual refund. **Flags:**
  F, V.
- **Fix:** Add a nonterminal partial/retry state or retry only failed buckets under the attempt lock.
- **Migration / backfill:** SQL required. Scan fulfilled attempts containing failed buckets.
- **Tests:** Repeated webhook, crash, concurrent retry, eventual success, and retry exhaustion.

#### PAY-06 — Card coupon usage is raceable

- **Severity / confidence:** High / Confirmed
- **Evidence:** Coupon availability is checked in application code at
  `app/api/payments/paymob/intention/route.ts:111-117` and
  `lib/payments/createIntentionForCart.ts:215-224`. `create_payment_attempt` has no coupon reservation
  at `20260815213740_product_launch_policy_and_opening_stock.sql:1713-1845`; usage increments later at
  lines 2500-2502. COD performs a proper atomic lock/check at lines 1997-2021.
- **Failure path:** Concurrent card intentions use a coupon with one remaining use.
- **Impact:** Multiple customers receive the discount beyond `max_uses`. **Flags:** F, X.
- **Fix:** Atomically reserve coupon use when an attempt is admitted, release on expiry/failure, and
  consume exactly once after capture.
- **Migration / backfill:** SQL required. Audit open attempts and excess redemptions.
- **Tests:** `max_uses=1` concurrent intentions, expiry, failure, replay, and release.

#### PAY-07 — Shipping is recalculated after capture

- **Severity / confidence:** High / Confirmed
- **Evidence:** Intention uses current settings in `app/api/payments/paymob/intention/route.ts:109-110`
  and `lib/payments/createIntentionForCart.ts:190-198`. Fulfillment rereads `site_content` at
  `20260815213740_product_launch_policy_and_opening_stock.sql:2291-2293` and recalculates shipping at
  lines 2449-2470.
- **Failure path:** Delivery fee or free-shipping threshold changes between intention and webhook.
- **Impact:** Order totals, bucket/refund accounting, and captured amount disagree. **Flags:** F, V.
- **Fix:** Snapshot final fee rules and per-bucket totals before provider checkout; fulfillment must
  use only the immutable charged snapshot.
- **Migration / backfill:** SQL required. Reconcile recent attempts spanning setting changes.
- **Tests:** Webhook fulfillment after every fee/threshold change and rounding boundary.

#### PAY-08 — A later success may not recover a prior decline

- **Severity / confidence:** High conditional / Runtime verification required
- **Evidence:** `mark_payment_attempt_declined` moves pending/processing to failed at
  `20260812000001_paymob_webhook_and_paid_fulfillment.sql:193-206`; `mark_payment_attempt_paid` accepts
  only pending/processing at lines 120-142.
- **Conditional path:** A decline event precedes a successful retry or out-of-order event for the same
  Paymob order.
- **Potential impact:** A captured payment remains failed and fulfillment retries indefinitely fail.
  **Flags:** F, V.
- **Safe reproduction:** Paymob sandbox event-order matrix; do not simulate against production.
- **Fix:** Model provider transactions/events separately and allow a verified later capture to
  supersede decline when order, amount, currency, and integration identity match.
- **Migration / backfill:** SQL required if confirmed. Compare failed attempts with provider captures.
- **Tests:** Every decline/success/pending ordering and replay permutation.

#### PAY-09 — Manual refund recording is not tied to a real refund obligation

- **Severity / confidence:** High / Confirmed
- **Evidence:** Admin detail treats all fulfilled attempts as eligible at
  `app/admin/payments/[id]/page.tsx:9-15,128-136`. The RPC allows `fulfilled` or
  `fulfillment_failed` without requiring a failed bucket at
  `20260812000001_paymob_webhook_and_paid_fulfillment.sql:506-539`. The API requires no amount or
  provider reference at `app/api/admin/payments/[id]/mark-refunded/route.ts:22-36`. Order readers keep
  `orders.payment_status`, and `lib/orders/paymentPresentation.ts:3-19` still renders Paid.
- **Impact:** A clean payment can be declared refunded without proof, or a legitimate refund can leave
  Admin/customer/brand records contradictory. **Flags:** F, V.
- **Safe reproduction:** Disposable fulfilled attempt with no failed bucket; mark refunded and inspect
  related order presentation.
- **Fix:** Require an eligible refund obligation, exact amount, provider reference, and refund status;
  allocate it atomically across buckets/orders.
- **Migration / backfill:** SQL required. Audit refunded attempts with no failed bucket and sibling
  orders still Paid.
- **Tests:** Full/partial refund, duplicate recording, provider reference uniqueness, and cross-surface
  parity.

### Upload and document security

#### APP-01 — Application deletion is non-transactional and orphans private documents

- **Severity / confidence:** High / Confirmed
- **Evidence:** `app/api/admin/applications/[id]/route.ts:247-300` deletes child tables sequentially,
  including document metadata, then deletes the parent. It never collects or queues underlying Storage
  paths.
- **Affected actors/surfaces:** Full Admin, applicants, private legal documents, retention, audit, and
  Storage cleanup.
- **Failure paths:** An intermediate DB failure leaves a partially destroyed application. A successful
  metadata delete removes the normal reference to files that remain in Storage.
- **Impact:** Partial deletion and indefinite retention of private legal files. **Flags:** D, P.
- **Safe reproduction:** Failure injection after every child-table delete on a disposable project.
- **Fix:** A single transactional DB operation must collect paths, enqueue `storage_cleanup_jobs`, and
  delete child/parent rows atomically; physical deletion remains retryable.
- **Migration / backfill:** SQL required. Inventory and reconcile orphaned private documents.
- **Rollout risk:** Medium because legal retention and deletion policy must be explicit.
- **Tests:** All-or-nothing DB state, cleanup retries, idempotency, and eventual file removal.

#### PDF-01 — Page-level PDF actions survive sanitization

- **Severity / confidence:** Medium / Confirmed sanitizer bypass; viewer exploitability varies
- **Evidence:** `lib/uploads/applicationDocument.ts:48-91` copies pages and deletes only `/Annots` at
  lines 69-81. An in-memory reproduction showed that page `/AA` and `/JavaScript` remain after the
  current `pdf-lib` copy process. `tests/uploadSecurityHardening.test.ts:100-120` covers catalog
  OpenAction and annotations, but not page `/AA`.
- **Affected actors/surfaces:** Brand applicants, Admin reviewers, legal-document downloads, desktop
  PDF viewers.
- **Failure path:** A valid PDF containing page-open/page-close JavaScript or Launch actions is
  sanitized, downloaded, and opened in a capable viewer.
- **Impact:** Active content can survive sanitization. Forced attachment/no-sniff headers reduce
  browser-origin risk but do not neutralize desktop viewer behavior. **Flags:** U, P.
- **Safe reproduction:** Construct the PDF entirely in memory and inspect the sanitized object graph;
  never open it in a production workstation viewer.
- **Fix:** Prefer specialist content disarm/reconstruction or a rasterized archival representation.
  At minimum recursively reject/remove `/AA`, `/A`, JavaScript name trees, Launch/URI/GoToR actions,
  embedded files, and other active dictionaries.
- **Migration / backfill:** No schema migration. Existing PDFs should be quarantined/reprocessed or
  opened only through a controlled safe-view policy.
- **Tests:** Page `/AA`, Launch, nested actions, embedded files, and proof that no reachable active
  object remains.

#### DOC-01 — Applicant document replacement/deletion is non-atomic

- **Severity / confidence:** Medium / Confirmed
- **Evidence:** Replacement update result is ignored at
  `app/api/join/application/documents/route.ts:158-165`. DELETE removes Storage first and updates the
  DB afterward at lines 170-204. Active-document count is checked outside a DB constraint/transaction
  at lines 109-121.
- **Impact:** An uploaded record can point to a missing file, replacement can leave multiple active
  documents, and parallel uploads can exceed the limit. **Flags:** D, P, X.
- **Fix:** Transactionally update document state and enqueue durable cleanup; enforce active
  replacement/count rules inside a locked RPC or constraint.
- **Migration / backfill:** SQL required. Audit records whose Storage object is absent.
- **Tests:** Storage-success/DB-failure, DB-success/Storage-failure, concurrent upload/replace, and
  idempotent retry.

#### STOR-01 — Public media lifecycle can orphan known objects

- **Severity / confidence:** Low-Medium / Confirmed
- **Evidence:** Brand image upload/delete at `app/api/brands/[slug]/image/route.ts:66-160`, collection
  cover upload/delete at `app/api/brands/[slug]/collections/[id]/cover-image/route.ts:54-121`, and
  review delete at `app/api/reviews/[id]/route.ts:19-25` have DB/Storage failure paths that leave
  objects behind or ignore remove results.
- **Impact:** Storage growth and continued availability to anyone retaining a public URL. **Flags:** P.
- **Fix:** Use the existing durable cleanup registry for every upload replacement/deletion.
- **Migration / backfill:** Cleanup-job support may need extension; scan for unreferenced objects.
- **Tests:** DB failure after upload, Storage failure after DB change, retry, and reference retention.

### Web application security

#### WEB-01 — Operational rate limiting is per-instance only

- **Severity / confidence:** Medium / Confirmed
- **Evidence:** `lib/rateLimit.ts:3-10,35-46` stores limits in an in-memory `Map`. OTP send relies on
  it at `app/api/account/phone/send-otp/route.ts:20-53`; checkout, uploads, and other routes also use
  it.
- **Impact:** Cold starts, regions, and parallel instances weaken the effective ceiling. The strongest
  confirmed risk is SMS cost abuse/phone harassment, not account takeover. **Flags:** F.
- **Safe reproduction:** Multi-instance limiter tests with a fake clock and shared/no-shared stores.
- **Fix:** Distributed limits by authenticated user, normalized phone hash, and IP; provider cooldown,
  alerts, and spend caps.
- **Migration / backfill:** Depends on Redis/Firewall/DB choice; no backfill.
- **Tests:** Cross-instance concurrency, rotating user/IP, per-phone ceiling, and provider failure.

#### WEB-02 — Production CSP permits inline scripts

- **Severity / confidence:** Low / Confirmed defense-in-depth issue
- **Evidence:** `next.config.js:17-38` retains `'unsafe-inline'` in production `script-src`.
- **Impact:** CSP provides less containment if another XSS defect is introduced. No exploitable XSS
  sink was confirmed in this audit.
- **Fix:** Migrate to nonce/hash-based CSP where Next.js rendering permits it.
- **Migration / backfill:** None.
- **Tests:** Production header snapshots, hydration, third-party integrations, and browser CSP reports.

### Notifications and background processing

#### NOTIFY-01 — Critical order notifications are not durably retried

- **Severity / confidence:** Medium / Confirmed
- **Evidence:** Callers ignore or cannot retry ordinary email/notification failures at
  `app/api/orders/route.ts:390-399`, `app/api/payments/paymob/webhook/route.ts:177-183`, and
  `lib/orders/notifyBrandOwnersOfNewOrder.ts:41-57`. Back-in-stock uses a durable outbox, but general
  order/customer notifications do not.
- **Impact:** A real order remains correct, but confirmation or owner alerts can be permanently lost.
  **Flags:** V.
- **Fix:** Durable outbox and per-channel idempotency for critical notifications.
- **Migration / backfill:** SQL required; usually no historical backfill.
- **Tests:** Provider failure, worker crash, retry, duplicate suppression, and channel-level state.

#### NOTIFY-02 — Back-in-stock eligibility can become stale after claim

- **Severity / confidence:** Low / High confidence
- **Evidence:** Claim checks eligibility in the DB, but external sends later occur at
  `lib/backInStock.ts:272-329` without a final state check.
- **Impact:** A product paused or made ineligible after claim can still receive a notification. **Flags:**
  V.
- **Fix:** Recheck immediately before each channel and defer without consuming an attempt if
  temporarily ineligible.
- **Migration / backfill:** Usually no migration.
- **Tests:** Pause/out-of-stock/brand-disable between claim and send.

### Privacy and retention

#### PRIV-01 — Raw PII and internal errors can be mirrored to Discord

- **Severity / confidence:** Medium / Confirmed transmission; contractual compliance unverified
- **Evidence:** `lib/errorLog.ts:8-16` forwards context, `lib/email/sendEmail.ts:43-50` includes the
  recipient email, `lib/notify.ts:118-142` forwards bodies/actor/meta, and
  `lib/discord.ts:48-54,94-127` removes links/formatting but not emails, phones, or names.
- **Affected actors/surfaces:** Customers, applicants, staff, email provider errors, Discord retention,
  and audit governance.
- **Impact:** Identifiers and operational errors can be retained in a third-party chat system beyond
  product retention/access expectations. **Flags:** P.
- **Safe reproduction:** Snapshot the payload passed to a fake webhook using synthetic PII.
- **Fix:** Central telemetry redaction, field allowlists, opaque IDs, and an approved retention/access
  policy.
- **Migration / backfill:** No SQL. Existing Discord retention should be reviewed and purged according
  to policy.
- **Tests:** Emails, phones, addresses, tokens, customer names, and raw provider/Postgres errors.

### Performance and reliability

#### PERF-01 — Admin Products performs unbounded in-memory filtering/pagination

- **Severity / confidence:** Medium / Confirmed
- **Evidence:** `lib/data/admin.ts:155-172` selects all products and loads every Variant.
  `app/admin/products/page.tsx:30-78` filters, sorts, counts, and slices in memory.
  `lib/data/variants.ts:40-65` uses large `.in(...)` queries for all product/Variant IDs.
- **Impact:** Increasing latency and memory use as the catalog grows; results can also be truncated by
  deployed PostgREST limits. **Flags:** V.
- **Safe reproduction:** Seed only a disposable database with a large synthetic catalog and profile
  query count, response size, and pagination correctness.
- **Fix:** Push filtering, sorting, count, and pagination to the DB; select only columns needed by the
  page and add supporting indexes.
- **Migration / backfill:** A view/RPC/index migration may be needed; no backfill.
- **Tests:** Large-catalog pagination, stable ordering, filters, counts, and query budget.

### UI and cross-surface consistency

#### MOB-01 — Mobile order lifecycle contract is stale

- **Severity / confidence:** Medium / Confirmed
- **Evidence:** `apps/mobile/src/domain/order-status.ts:1-13` knows only pending, paid, shipped,
  fulfilled, and cancelled. The canonical web/domain contract at `lib/orders/lifecycle.ts:3-31`
  includes confirmed, preparing, and ready_for_pickup. Mobile consumers index the missing maps at
  `apps/mobile/app/orders/index.tsx:20` and `apps/mobile/app/orders/[id].tsx:22-23`.
- **Impact:** Valid orders can render undefined labels/progress in Mobile. **Flags:** V.
- **Fix:** Share or generate the contract from one schema and cover every canonical/legacy status.
- **Migration / backfill:** None.
- **Rollout risk:** Low, but requires a Mobile release.
- **Tests:** Every status on list/detail/timeline, including legacy normalization.

#### A11Y-01 — Authentication and rich-text operational controls have accessibility gaps

- **Severity / confidence:** Low / Confirmed
- **Evidence:** `app/account/page.tsx:191-196` relies on placeholders without complete persistent
  labels/name/autocomplete metadata. `components/shared/PasswordInput.tsx:43-52` lacks a semantic
  label/name. `components/brand/RichTextEditableField.tsx:194-204` reveals an action on mouse hover
  without an equivalent focus treatment.
- **Impact:** Screen-reader and keyboard users can misidentify or miss important actions.
- **Fix:** Persistent labels, name/autocomplete, explicit error associations, and
  `focus-visible`/`group-focus-within` styles.
- **Migration / backfill:** None.
- **Tests:** Keyboard-only, screen reader names, focus visibility, and automated accessibility checks.

#### MOB-I01 — Mobile checkout is COD-only

- **Severity:** Informational product parity gap
- **Evidence:** `apps/mobile/app/checkout.tsx:49-56` explicitly exposes Cash on Delivery only while web
  has Paymob.
- **Impact:** Capability mismatch, not a security defect. Card payment must not be added to Mobile until
  PAY-01 through PAY-09 are corrected.

### Dependencies and deployment configuration

#### TEST-01 — Unsafe live-test gating and false CI assurance

- **Severity / confidence:** High / Confirmed
- **Evidence:** `tests/avatarLinking.test.ts:23-46`,
  `tests/crossTenantIsolation.test.ts:28-49`, and `tests/security.rls.test.ts:19-44` load only
  `.env.local` and auto-enable when credentials exist. They create/delete auth users and tenant data.
  Cleanup results are ignored or unchecked at `crossTenantIsolation.test.ts:158-161,217-220`,
  `avatarLinking.test.ts:94-95` and equivalent finalizers, and
  `security.rls.test.ts:349-350,394-397,443-446`. The safer pattern and warning that `.env.local`
  targets the real project already exist at `tests/fulfillmentIntegration.test.ts:18-24,51-54`.
  CI injects variables through `process.env` at `.github/workflows/ci.yml:12-16,34-35`, which these
  suites ignore on a clean runner.
- **Affected surfaces:** Developer machines, production/staging data, Auth users, CI assurance, brands,
  products, collections, profiles, and addresses.
- **Failure path:** Ordinary local `npm test` mutates the configured project. In CI the gitignored
  `.env.local` is absent, so the advertised live suites can skip despite green checks.
- **Impact:** Real fixtures can be created/deleted and left behind; CI can claim RLS coverage that did
  not run. **Flags:** D, U, P.
- **Safe reproduction:** Unit-test the loader itself and assert that no Supabase client is constructed
  without an explicit opt-in. Run the integration suite only on a dedicated disposable project.
- **Fix:** Require `RUN_LIVE_RLS=1`; allowlist a disposable project ref and deny production refs; use a
  shared environment loader; assert cleanup; isolate the live CI job; fail if expected suites skip.
- **Migration / backfill:** No SQL. Inspect the configured project for the known fixture prefixes after
  explicit approval.
- **Rollout risk:** Low and urgent.
- **Tests:** Dry-run/no-client, disposable live run, forced cleanup failure, and executed/skipped counts.

#### CI-01 — Service-role secret is job-wide

- **Severity / confidence:** High conditional / Confirmed exposure
- **Evidence:** `.github/workflows/ci.yml:12-26` makes the service-role key available before checkout,
  Node setup, and `npm ci`. Actions are referenced by mutable major tags.
- **Conditional impact:** A compromised action, dependency lifecycle script, or malicious trusted-code
  change can read a database-bypass credential. Severity is highest if the key is production-linked.
  **Flags:** U, D, P.
- **Safe reproduction:** CI policy test that asserts the variable is absent during install/build and
  present only during the isolated live-test step.
- **Fix:** Use a disposable project, scope secrets to the live step, pin actions by full commit SHA,
  and use `npm ci --ignore-scripts` where compatible.
- **Migration / backfill:** None. Consider credential rotation after log/repository-access review if a
  production key has been exposed to untrusted steps.
- **Rollout risk:** Low.

#### CFG-01 — Scheduled visibility activation is not declared in Vercel cron configuration

- **Severity / confidence:** Medium, configuration-dependent / High confidence for repository config
- **Evidence:** The protected route exists at
  `app/api/cron/activate-product-visibility/route.ts:5-25`, but `vercel.json:3-12` schedules only
  storage cleanup and back-in-stock delivery.
- **Conditional impact:** If no external scheduler exists, scheduled products are not activated or
  stamped on time. **Flags:** V.
- **Fix:** Declare the schedule or document the external scheduler as the source of truth; alert on
  missed executions.
- **Migration / backfill:** None for scheduling; delayed timestamps may need controlled repair.
- **Tests:** Idempotent activation, overlap, missed-run recovery, and authenticated cron calls.

#### MOB-CI-01 — Mobile is excluded from root verification

- **Severity / confidence:** Medium / Confirmed
- **Evidence:** Root `tsconfig.json:40-42` excludes `apps/mobile`; `eslint.config.mjs:8-13` ignores it;
  `.github/workflows/ci.yml:25-38` runs only root checks. Mobile has its own scripts in
  `apps/mobile/package.json:6-14`, but CI never installs/runs them.
- **Impact:** Contract drift such as MOB-01 can merge without detection. **Flags:** V.
- **Fix:** Add a separate `npm ci --prefix apps/mobile` and Mobile typecheck/lint/test job.
- **Migration / backfill:** None.
- **Tests:** CI fixture proving a deliberate Mobile type error fails the job.

## E. Cross-surface consistency matrix

| Workflow | Customer | Admin | Brand Owner | Assistant/staff | Admin impersonation | Mobile | API/database truth |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Product publish | Can see an incomplete product | Non-atomic publish | Same sequence | Depends on route role | Can reach portal paths | Consumes catalog | Visibility does not require completeness |
| Archived stock | Usually hidden | Can adjust | Can submit crafted request | Depends on route | Owner-level context risk | State may be unexplained | Stock/request RPCs omit archived-parent guard |
| Card checkout | Can be charged without an order | Reconciliation is incomplete | Missing fulfillment visibility | N/A | N/A | Card not implemented | Provider linkage fails open |
| Paid cancellation | Remains charged | Can cancel | Can cancel | AUTH-01 may widen access | Elevated risk | Still shows Paid | Stock is restored without refund obligation |
| Refund state | Can still see Paid | Can mark loosely | Can still see Paid | N/A | N/A | Can still show Paid | Attempt and orders are not updated together |
| Warehouse correction | N/A | Legacy direct bypass | History can be incomplete | Receiver can bypass CRN | Same route | N/A | Two accounting/history models coexist |
| Stock return | Availability decreases | Reviews request | Allowed | Incorrectly allowed | Context-dependent | N/A | Route does not enforce owner-only |
| Order lifecycle | Web understands canonical states | Canonical states | Canonical states | Permission-dependent | AUTH-01 risk | Contract is stale | API returns the new states |
| Application documents | N/A | Delete can orphan files | Applicant can lose a referenced file | Application staff | N/A | N/A | DB and Storage changes are non-atomic |
| Notifications | Message can be lost | Order remains valid | Owner alert can be lost | N/A | N/A | Depends on API | No general durable outbox |

## F. Database and migration plan

No migration should be written or applied until the remote migration ledger, a verified backup, and a
disposable Staging project are available. Never rewrite an applied migration.

### Required forward migration order

1. **Payment preservation and reconciliation**
   - Preserve payment attempts when an auth user is deleted.
   - Add durable provider linkage/reconciliation by `special_reference`.
   - Add immutable charged totals and per-bucket amount snapshots.
2. **Refund obligations and canonical cancellation**
   - Add explicit refund amount/state/provider reference.
   - Update Admin, Brand, customer, group, and single-order cancellation together.
   - Allocate refund state across attempts, buckets, orders, reports, and notifications atomically.
3. **Coupon reservation and partial fulfillment**
   - Add reservation/release/consume lifecycle.
   - Add nonterminal partial/retry states and failed-bucket retry semantics.
4. **Product lifecycle**
   - Add atomic product-graph publishing and completeness validation.
   - Guard Archived products at every stock/request entry point.
   - Close transition gaps, unify lock order, and correct `first_visible_at` semantics.
5. **Warehouse accounting**
   - Disable legacy direct correction and legacy inbound receipt paths.
   - Add request-level idempotency and deterministic locks.
6. **Application/document cleanup**
   - Add transactional deletion and durable Storage cleanup.
   - Add locked document replacement/count rules.
7. **Notification reliability**
   - Extend the durable outbox pattern to critical order/customer/brand messages.

### Backfill strategy

- Separate detection from correction. Produce a read-only reconciliation report before changing money
  or stock.
- Reconcile payments against Paymob provider records and immutable historical snapshots, never current
  product prices or shipping settings.
- Inspect cancelled card orders, failed/partial buckets, refunded attempts, coupon overuse, attempts
  missing provider linkage, and account-deletion failures.
- Inspect Archived products with stock/open documents/post-archive movements.
- Inspect legacy warehouse corrections/receipts before creating any historical CRN/receipt record.
- Process backfills in bounded, resumable batches with an operation key and stored response.

### Locking and availability

- Do not replay either duplicate launch-policy migration in production.
- Establish a global lock order before adding retry logic.
- Add large constraints as `NOT VALID` and validate separately when appropriate.
- Use concurrent indexes where PostgreSQL permits it.
- Avoid combining a large backfill and behavior-changing DDL in one long transaction.

### Rollback and forward repair

- Use forward-only repair migrations.
- For payment schema changes, use a short dual-read/dual-write compatibility period if necessary.
- Preserve provider/payment/refund audit records even after customer anonymization.
- Every new privileged RPC must use fully qualified objects, `search_path=''`, explicit `REVOKE`, and
  the narrowest possible `GRANT`.

## G. Prioritized corrective plan

### 1. Immediate production blockers

1. Fail-close Paymob checkout until provider linkage is durable.
2. Reject Admin/Brand cancellation of paid/card orders until refund obligations exist.
3. Prevent manual refund recording without an eligible obligation, amount, and provider reference.
4. Close limited-staff Brand Portal impersonation/write access.
5. Gate all live Supabase tests behind explicit disposable-project opt-in.
6. Reject legacy direct warehouse corrections and legacy inbound receipt payloads.

### 2. Security and data-integrity fixes

1. Implement atomic application deletion and durable Storage cleanup.
2. Replace the incomplete PDF sanitizer with content disarm/reconstruction or a strict recursive
   active-object rejection policy.
3. Add Archived lifecycle guards and historical-correction exceptions.
4. Enforce owner-only stock returns.
5. Add centralized telemetry redaction and restrict Discord retention/access.
6. Scope CI secrets to isolated steps and pin third-party actions.

### 3. Workflow consistency fixes

1. One order/payment/refund status contract for customer, Admin, Brand Portal, Mobile, reports, and
   notifications.
2. One immutable warehouse receipt/CRN history model.
3. One publish-completeness rule for Admin and Brand Portal.
4. One cancellation/refund workflow across customer, Admin, Brand Owner, assistants, and impersonation.

### 4. Reliability and race-condition fixes

1. Atomic product publishing.
2. Coupon reservation.
3. Immutable shipping/bucket snapshots.
4. Partial-fulfillment retries.
5. Request-level inventory idempotency.
6. Global lock hierarchy.
7. Durable notification outbox.

### 5. UX and accessibility

1. Persistent authentication labels, names, autocomplete, and error associations.
2. Keyboard-visible rich-text actions.
3. A clear Admin reconciliation state for captured-but-not-fulfilled payments.
4. Consistent refund amount/reference/state presentation across every surface.

### 6. Technical debt

1. Retire legacy RPCs after dependency search.
2. Document duplicate migration history without rewriting it.
3. Move Admin product filters/sort/pagination to the database.
4. Add a dedicated Mobile CI job.
5. Remove CSP `unsafe-inline` in a separately tested hardening pass.
6. Declare or document the scheduled product-visibility scheduler.

## H. Required verification

### Unit tests

- Paymob response validation and persistence failure boundaries.
- Payment/refund state machine and amount invariants.
- Canonical status normalization for web and Mobile.
- Operation payload hashing and idempotent response replay.
- PII redaction before telemetry delivery.
- Recursive PDF active-object detection.

### API and role-matrix tests

- Full Admin, limited custom-role staff, Brand Owner, assistant, unrelated owner, customer, and Admin
  impersonation.
- Every Brand Portal read/export/write route.
- Paid/COD cancellation for customer, Admin, Brand, group, and single-order paths.
- Legacy warehouse payload rejection and owner-only returns.
- Account deletion at every payment-attempt state.

### Database/RLS tests

- Run only on a disposable project with explicit `RUN_LIVE_RLS=1` and project-ref allowlisting.
- Assert that expected live suites executed and that every cleanup succeeded.
- Direct service-role lifecycle transition matrix.
- Product completeness, Archived guards, refund obligations, and coupon reservations.

### Concurrency tests

- Coupon `max_uses=1` card intentions.
- Shared-Variant checkouts and cancellations.
- Archive/receive, archive/adjust, delete/correct, and resume/adjust lock pairs.
- Concurrent document uploads/replacements.
- Repeated and out-of-order payment webhooks.

### Payment sandbox tests

- Provider success followed by every local persistence failure boundary.
- Missing/malformed intention/order IDs in a successful HTTP response.
- Decline/success/pending event permutations.
- Full and partial fulfillment failure, retry, refund, and rounding.
- Provider reconciliation by `special_reference`.

### Inventory accounting tests

- Opening stock, negative-stock prevention, wrong Variant, damaged, missing, excess, hold, return,
  correction, rejection, and cancellation.
- Ledger before/after chain and cross-bucket balance.
- Admin and Brand Portal history parity.

### Upload-security tests

- Double extensions, MIME spoofing, polyglots, corrupt images, dimension bombs, and Unicode filenames.
- PDF `/AA`, Launch, nested actions, embedded files, and trailing payloads.
- Storage/DB failure ordering and orphan cleanup.

### Browser and regression tests

- Auth redirects, role-gated navigation, impersonation read-only behavior.
- Product Draft/Published/Paused/Archived/delete/restore/scheduled/`when_stocked` flows.
- Storefront search/catalog/detail/cart/wishlist/checkout consistency.
- Keyboard and screen-reader coverage for operational actions.

## I. Areas reviewed with no confirmed issue

The audit found no confirmed defect in these inspected controls:

- Safe redirect validation rejects absolute, protocol-relative, backslash, and encoded bypasses.
- OAuth callback uses PKCE and does not log tokens.
- MFA checks fail closed.
- Proxy code overwrites the pathname header rather than trusting a client value.
- Image uploads validate signatures and dimensions, enforce pixel/page limits, and decode/re-encode
  images, protecting against double extensions and image polyglots.
- Brand application document Storage is private, and Admin download validates linkage and forces
  attachment/no-store/no-sniff headers.
- Paymob HMAC verification is timing-safe and amount/currency checks exist.
- COD derives prices and quantities server-side and rechecks visibility/stock under database locks.
- Product/Variant mismatches are rejected by a database trigger.
- The V2 warehouse receipt/correction core has strong fingerprints, deterministic local locks,
  nonnegative stock checks, source-bucket bounds, immutable receipt rows, and independent approval.
- Customer cancellation correctly blocks paid/card orders; the defect is the missing equivalent rule
  in Admin/Brand paths.
- The canonical storefront predicate combines product status, schedule, active brand, launch policy,
  stock timing, and open-transition gates.
- Wishlist creation/removal and service-role reads recheck canonical visibility.
- Back-in-stock has a durable leased outbox and per-channel idempotency.
- CSV formula injection is neutralized.
- No permissive CORS, user-controlled SSRF, path-based filesystem access, `eval`, `new Function`, or
  child-process execution was confirmed.
- Cron routes fail closed when their secret is missing.
- Rich text is sanitized before the known HTML rendering sink.

These are static-code conclusions and do not prove that production configuration matches the
repository.

## J. Limitations

The audit could not prove the following without additional authority or an isolated environment:

- Live RLS/grants/functions/storage behavior under role-specific credentials.
- Production migration ledger and schema drift.
- Supabase password recovery, MFA, email, and redirect configuration.
- Paymob event order, refund API behavior, or provider reconciliation without sandbox credentials.
- Real deadlocks and race behavior without a disposable database and concurrent sessions.
- Production logs, Discord retention/access, or Vercel Firewall/rate-limit configuration.
- An external scheduler not represented in `vercel.json`.
- Authenticated browser flows without dedicated test accounts.
- Absence of fixture residue after the test-safety incident described in section B.
- Dependency CVEs because no networked dependency audit was run.
- A full Mobile build because nested Expo dependencies were not installed in the worktree.
- A production Next.js build because it would write generated `.next` output.
- Viewer-level execution of the surviving PDF action; behavior depends on the PDF viewer.

## Resume protocol

When corrective work resumes:

1. Start from PAY-01 through PAY-04; do not begin with UI polish or lower-risk hardening.
2. Reconfirm the current branch, HEAD, worktree status, production deployment revision, and remote
   migration ledger before editing.
3. Create a dedicated corrective branch from the latest agreed base.
4. Design the payment/refund schema and reconciliation report before writing SQL.
5. Apply the platform-wide consistency rule to customer, Admin, Brand Portal, assistant/staff,
   impersonation, Mobile, API/database state, reports, history, notifications, and tests.
6. Before any push, merge, deploy, or production verification, explicitly state whether SQL is
   required and remind the owner to apply migrations in the reviewed order before testing dependent
   application code.
7. Update this document per finding with `Open`, `In progress`, `Fixed`, `Verified in Staging`, and
   `Verified in Production` states. Never mark a finding fixed based only on a code diff.

