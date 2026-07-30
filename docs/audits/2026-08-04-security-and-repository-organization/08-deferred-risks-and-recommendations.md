# Deferred Risks and Recommendations — 2026-08-04

## IMMEDIATE — none remaining

Both items originally listed here are now done:

- **RLS-016 migration** (`20260804000001_scope_product_child_table_rls.sql`)
  — applied to the live Supabase project by the project owner, re-verified
  live via `node --test tests/security.rls.test.ts` (12/12 passing).
- **SEC-008 (raw error leakage)** — fully closed. All 10 brand-portal
  routes and all 35 admin routes now use `safeErrorResponse()`/`logError()`
  instead of returning `error.message` to the client. See
  `02-vulnerability-remediation-report.md` for both fixes' detail.

## NEXT (recommended in the next development phase)

### Regenerate/retire `schema.sql` as the source of truth (MIG-001)

- **Reason:** `schema.sql` is confirmed stale for at least one table
  (`product_variants`'s RLS policy — see
  `05-supabase-rls-and-function-audit.md`). This is a real risk for
  anyone provisioning a fresh environment from `schema.sql` alone.
- **Risk addressed:** Environment drift / accidentally shipping a
  weaker policy to a new environment than what production actually runs.
- **Complexity:** Large (needs a reviewed baseline strategy, not a
  mechanical fix).
- **Dependencies:** None blocking, but touches every future migration's
  workflow.
- **Affects:** Database, infrastructure/operations.

### Full route-by-route IDOR/output-filtering pass

- **Reason:** This audit's API authorization matrix confirmed every
  admin/brand-portal route has its expected top-level auth check, but did
  not re-verify every route's *output filtering* (does a response ever
  include a field it shouldn't for the caller's role?) or *IDOR*
  correctness (can a valid brand-owner ID be swapped for another brand's
  entity ID within an otherwise-authorized route?) line-by-line across
  all 87 routes.
- **Risk addressed:** Cross-tenant data leakage that a top-level "is this
  an admin/brand-owner" check wouldn't catch on its own.
- **Complexity:** Large.
- **Dependencies:** None.
- **Affects:** Web.

### Add a mobile TypeScript check to CI

- **Reason:** No `.github/workflows` exist at all currently (confirmed in
  preflight) — there is no CI in this repository today, web or mobile.
  The mobile app currently has 3 known type errors
  (`apps/mobile/app/(tabs)/categories.tsx`) that would have been caught
  automatically.
- **Risk addressed:** Silent regressions shipping to either app.
- **Complexity:** Medium (needs both a web and mobile job, plus deciding
  what blocks a merge vs. what's advisory).
- **Dependencies:** None.
- **Affects:** Web, mobile, CI/CD.

### Decide the fate of `chore/mobile-readiness`

- **Reason:** An entire alternate mobile implementation (104 files) sits
  unmerged and, per this audit's reading of the commit history, appears
  superseded — but that's this audit's inference, not confirmed intent.
- **Risk addressed:** Repository clarity; a future contributor could
  waste time on a branch nobody intends to land.
- **Complexity:** Small (a decision + `git branch -d`/archive, not a code
  change).
- **Dependencies:** Needs the product/mobile owner's confirmation before
  acting — explicitly out of this audit's authority per the task's own
  "do not delete branches" rule.
- **Affects:** Mobile, operations.

## LATER (useful after launch or at scale)

### Distributed rate limiting (SEC-007 follow-up)

- **Reason:** `lib/rateLimit.ts` remains a per-instance in-memory map,
  already documented as acceptable for current scale.
- **Risk addressed:** Coordinated abuse spread across many serverless
  instances.
- **Complexity:** Medium (needs a Redis/Upstash-backed limiter).
- **Dependencies:** A managed store (cost/ops tradeoff).
- **Affects:** Infrastructure.

### Column-level review of public product/brand fields

- **Reason:** Current RLS work (including this pass's RLS-016 fix) is
  row-level only — no column has ever been individually reviewed for
  whether it should be excluded from public SELECT even on published
  rows.
- **Risk addressed:** Over-broad column exposure on otherwise-correctly-
  scoped rows.
- **Complexity:** Medium.
- **Dependencies:** None.
- **Affects:** Database.

### Dead-code / unused-export sweep with a proper tool

- **Reason:** Not run this pass (no existing tool in the repo, and
  installing one without a specific finding to justify it wasn't
  warranted this pass per the task's own "don't add tools for
  appearance" instruction).
- **Risk addressed:** Maintainability, smaller bundle/attack surface.
- **Complexity:** Small to run, potentially Medium to act on findings
  safely.
- **Dependencies:** A tool choice (e.g. `ts-prune`, `knip`).
- **Affects:** Web.

### Payment gateway integration

- **Reason:** Already tracked in `CLAUDE.md`'s "Not done yet" list — cash
  on delivery only, no live payment processor. Re-confirmed unchanged
  this pass, not a new finding.
- **Risk addressed:** N/A (product roadmap item, not a security gap per
  the existing PAY-001 resolution).
- **Complexity:** Large.
- **Dependencies:** PCI-compliant provider selection (Paymob/Fawry/Stripe
  per `CLAUDE.md`).
- **Affects:** Web, infrastructure, operations.
