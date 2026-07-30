# Security & Repository Organization Audit — 2026-08-04

Branch: `audit/security-and-repository-organization` (from `main` @ `0f8410d`)

This audit builds on top of the earlier, already-merged
`docs/security-audit.md` and `docs/full-platform-audit.md` (audit started
2026-07-22, verified live 2026-07-23, merged to `main`). Those documents
already closed both Critical findings and most High findings. This pass:

1. Re-verified those earlier fixes are still intact after subsequent
   development (product editor rebuild, inventory/variant rebuild, mobile
   app, Page Studio, brand-application rebuild).
2. Extended the audit into areas that either didn't exist yet at the time
   of the original audit, or weren't in its scope: the product
   option/variant/color-image child tables, the newer Product Editor
   publishing/New-Arrivals/Featured logic, and repository/mobile/branch
   hygiene.
3. Found and fixed one previously-undocumented **High** severity RLS gap
   (RLS-016, see below).

## Scope actually covered in this pass

Given the size of the requested 26-part audit spec, this pass is a real,
evidence-based first phase — not a claim of exhaustive coverage of every
listed part. What was actually inspected with concrete evidence (grep,
direct file reads, live read-only anon-key/service-role probes, `npm
audit`, `tsc`, `eslint`, `npm test`, `npm run build`):

- Git/branch/worktree/stash/tag state (preflight).
- Mobile work location and status on `main` vs. `chore/mobile-readiness`.
- `codex/website-design-preview` branch vs. `main`.
- Supabase RLS policies for every table touched by the 2026-07-31 to
  2026-08-03 product/variant/inventory rebuild migrations.
- `SECURITY DEFINER` / `search_path` pinning coverage across all 54
  instances in `supabase/migrations/*.sql` + `supabase/schema.sql`.
- Admin vs. brand-portal route authorization for the newly-added
  Featured feature/unfeature bulk action.
- Error-message leakage pattern (`error.message` returned to the client)
  across admin/brand-portal routes — confirmed still open, matches the
  already-documented SEC-008 "remaining risk" exactly, not a new finding.
- `dangerouslySetInnerHTML`, `target="_blank"`, secret-naming patterns in
  `NEXT_PUBLIC_*` env vars.
- `npm audit` (dependency vulnerabilities).
- Root `tsc --noEmit`, `eslint .`, `npm test`, `npm run build`.
- Mobile `tsc --noEmit` (read-only — no mobile files modified).
- Tracked-file hygiene (accidental logs/backups/screenshots).

## Scope intentionally deferred (not fabricated as "done")

The full 26-part / 50-item request in the task prompt describes a
multi-week enterprise audit engagement (full route-by-route API matrix
with individual evidence per route, per-table RLS role-matrix across every
role, manual verification of all 20 listed attack scenarios against a
running app, a full dependency supply-chain review, CI/CD design, backup
strategy, etc.). Producing genuine, evidence-based findings for all of
that in one pass isn't realistic without fabricating "verified" claims
that weren't actually checked — which the task's own completion rule
explicitly forbids ("do not claim completion if... reports are
incomplete" is honored by being explicit about what's incomplete, not by
padding). See `08-deferred-risks-and-recommendations.md` for the prior­
itized list of what a follow-up pass should cover next, and
`09-production-readiness-checklist.md` for exact commands.

## Documents in this folder

1. `01-security-audit-report.md`
2. `02-vulnerability-remediation-report.md`
3. `03-repository-organization-report.md`
4. `04-api-authorization-matrix.md`
5. `05-supabase-rls-and-function-audit.md`
6. `06-protected-mobile-work-report.md`
7. `07-protected-design-preview-report.md`
8. `08-deferred-risks-and-recommendations.md`
9. `09-production-readiness-checklist.md`
