# Production Readiness Checklist — 2026-08-04

**Update (same day, part 1):** the RLS-016 migration
(`20260804000001_scope_product_child_table_rls.sql`) was applied to the
live Supabase project by the project owner. Re-ran
`node --test tests/security.rls.test.ts` immediately after — 12/12
passing live, including the new RLS-016 regression test. RLS-016 is now
**closed**, not just fixed-in-code. "Exact commands required AFTER
merge" step 2 below is complete; step 3 was re-run as confirmation.

**Update (same day, part 2):** extended the SEC-008 fix (safe error
responses) to all 10 `app/api/brand-portal/**` routes — see
`02-vulnerability-remediation-report.md`. Full verification re-run after
this change (`tsc`, `eslint app/api/brand-portal`, `npm test`,
`npm run build`) — all clean, 253/253 tests passing.

**Update (same day, part 3):** extended the same fix to the remaining 35
`app/api/admin/**` routes. **SEC-008 is now fully closed** — zero routes
in either `app/api/admin/**` or `app/api/brand-portal/**` return a raw
database error message to the client. Full verification re-run again
(`tsc`, `eslint app/api/admin`, `npm test`, `npm run build`) — all clean,
253/253 tests passing.

## Results on this branch (`audit/security-and-repository-organization`)

| Check | Command | Result |
|---|---|---|
| Root TypeScript | `npx tsc --noEmit -p tsconfig.json` | Clean, no output |
| Root ESLint | `npx eslint .` | Clean, no output |
| Full test suite | `npm test` | 253/253 passing |
| Production build | `npm run build` | Succeeded, all routes generated |
| Mobile TypeScript (read-only) | `cd apps/mobile && npx tsc --noEmit -p tsconfig.json` | 3 pre-existing errors, unrelated to this branch — see `06-protected-mobile-work-report.md` |
| Dependency audit | `npm audit --omit=dev`, `npm audit fix`, `npm audit fix --force` | 3 High advisories (Next.js → postcss/sharp) confirmed still open, no safe fix (only resolution found is a breaking downgrade to `next@9.3.3`). `npm audit fix` (non-force) synced a harmless lockfile drift (`next` recorded as 16.2.10, actually installed/used at 16.2.12) — kept, verified with a full re-run of tsc/test/build. |
| Live RLS/RPC regression | `node --test tests/security.rls.test.ts` | 12/12 passing, live against the configured Supabase project |

## Exact commands required BEFORE merge

```bash
# 1. Re-run the full verification suite one more time immediately before merge,
#    in case another branch merged to main in the meantime.
npx tsc --noEmit -p tsconfig.json
npx eslint .
npm test
npm run build
```

## Exact commands required AFTER merge

```bash
# 2. DONE (applied by the project owner) — Apply the RLS-016 fix to the
#    live Supabase project. File:
#    supabase/migrations/20260804000001_scope_product_child_table_rls.sql

# 3. DONE — re-ran immediately after applying, confirmed 12/12 passing
#    live, including the new RLS-016 test:
node --test tests/security.rls.test.ts
```

## Whether this branch is safe to review for merging

Yes, with the caveat above: the code/migration/test changes on this
branch are self-contained, all verification passed, and no protected
work (mobile, `codex/website-design-preview`) was modified. The migration
itself still needs to be applied to the live database separately (step 2
above) for the RLS-016 fix to take effect in production — merging this
branch's code does not automatically apply it, since Next.js/Vercel
deploys don't run Supabase migrations automatically in this project's
current setup (no CI/migration-runner exists — see
`08-deferred-risks-and-recommendations.md`'s CI recommendation).

## Environment limitations encountered

- No live Vercel/production deployment access — headers, CSP, and
  runtime image-processing behavior (SEC-012, SEC-005 residual risk)
  could not be re-verified against an actual deployed instance, only
  against `next.config.js`'s source and `npm audit`.
- Supabase Storage bucket-level policies (as opposed to table RLS) live
  only in the Supabase dashboard, not in this repository — not
  independently re-verified this pass (same limitation the prior audit
  already documented for SEC-004).
- No CI environment exists to cross-check these results against — all
  verification in this report was run directly in the local development
  environment against the live Supabase project (via `.env.local`
  credentials that happened to be present locally).
