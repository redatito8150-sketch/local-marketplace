# Deferred Risks and Recommendations — 2026-08-04

## IMMEDIATE — none remaining

Both items originally listed here are now done:

- **RLS-016 migration** (`20260804000001_scope_product_child_table_rls.sql`)
  — applied to the live Supabase project by the project owner, re-verified
  live via `node --test tests/security.rls.test.ts` (12/12 passing).
- **SEC-008 (raw error leakage)** — fully closed, twice-verified. All 10
  brand-portal routes and all 35 admin routes that had a raw-error
  response now use `safeErrorResponse()`/`logError()` instead of
  returning `error.message` to the client (of the 43 total admin route
  files, the other 8 never had the issue); a follow-up full-route IDOR
  pass then found and fixed 5 more instances the original discovery
  grep's case-sensitivity missed (`brands/[slug]/follow`,
  `join/application/documents`, `admin`+`brand-portal` `product-options`
  list routes). See `02-vulnerability-remediation-report.md` for every
  fix's detail.
- **Full route-by-route IDOR/output-filtering pass** — complete. All 87
  routes individually read; no IDOR issue found anywhere (see
  `04-api-authorization-matrix.md`'s "Full IDOR/output-filtering pass"
  section for the full method and result).

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

### ~~Full route-by-route IDOR/output-filtering pass~~ — DONE

All 87 routes were individually read for IDOR/ownership correctness in a
follow-up pass. No IDOR issue found. See
`04-api-authorization-matrix.md`'s "Full IDOR/output-filtering pass"
section for the method, the two isolation patterns found (app-code
ownership checks, and one database-RLS-enforced case in
`brand-portal/reviews/[id]/reply`), and the 5 raw-error leaks the same
pass turned up and fixed (folded into SEC-008 above).

### Monitor for a patched Next.js release (SEC-005/DEP-001 follow-up)

- **Reason:** Re-confirmed this pass (see `01-security-audit-report.md`)
  that `next@16.2.12` — npm's current stable `latest` — still bundles a
  vulnerable `postcss@8.4.31`/`sharp@0.34.5`, and the only resolution
  `npm audit fix --force` can find is a breaking downgrade to `next@9.3.3`.
  There is nothing to fix today; this is a "watch and upgrade when
  possible" item, not a deferred fix.
- **Risk addressed:** 3 High-severity advisories (PostCSS XSS/path
  traversal, Sharp/libvips CVEs) remain present until Next.js ships a
  16.x (or later stable) release with patched dependencies.
- **Complexity:** Small to check periodically (`npm audit`); Medium to
  actually upgrade once available (needs the same test/build validation
  this pass ran).
- **Dependencies:** Upstream Next.js release.
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
