# Production Readiness Checklist — 2026-08-04

## Results on this branch (`audit/security-and-repository-organization`)

| Check | Command | Result |
|---|---|---|
| Root TypeScript | `npx tsc --noEmit -p tsconfig.json` | Clean, no output |
| Root ESLint | `npx eslint .` | Clean, no output |
| Full test suite | `npm test` | 253/253 passing |
| Production build | `npm run build` | Succeeded, all routes generated |
| Mobile TypeScript (read-only) | `cd apps/mobile && npx tsc --noEmit -p tsconfig.json` | 3 pre-existing errors, unrelated to this branch — see `06-protected-mobile-work-report.md` |
| Dependency audit | `npm audit --omit=dev` | 3 High advisories (Next.js → postcss/sharp), unchanged/already-documented (SEC-005/DEP-001), no safe fix available in the current Next major |
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
# 2. Apply the RLS-016 fix to the live Supabase project (the single
#    IMMEDIATE action item — see 08-deferred-risks-and-recommendations.md).
#    Use whatever mechanism this project normally uses to apply a new
#    migration file to production (Supabase CLI `supabase db push`, the
#    Supabase SQL editor, or the project's existing deploy pipeline) —
#    this audit did not run it against production itself.
#    File: supabase/migrations/20260804000001_scope_product_child_table_rls.sql

# 3. After the migration is live, re-run the live regression suite to
#    confirm the new policies behave as intended (it already passes
#    today because the catalog has no hidden-product data yet — this
#    step matters once real Draft/Archived products with variants/color
#    images exist):
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
