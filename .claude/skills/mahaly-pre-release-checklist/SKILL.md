---
name: mahaly-pre-release-checklist
description: Runs Mahaly's full local verification pass (TypeScript, ESLint, tests, build, dependency audit, live RLS regression suite, and a raw-database-error-leak grep) and reports a single pass/fail summary. Use this whenever the user asks to "check if the site is ready to push/deploy/merge", run the pre-release checklist, verify everything is green before pushing, or do a final check before opening a PR on this repo — even if they just say "verify everything" or "is this safe to ship" without naming the checklist. Also use it proactively after a batch of changes on this repo, before offering to commit or push.
---

# Mahaly Pre-Release Checklist

This mirrors the exact verification workflow already established for this
repo (see `CLAUDE.md` and `docs/audits/2026-08-04-security-and-repository-organization/09-production-readiness-checklist.md`)
— it doesn't invent new checks, it runs the same ones a careful session
would run by hand, in the same order, and reports the result compactly
instead of dumping raw command output into the conversation.

Run every step below from the repo root. Report **PASS/FAIL per step**,
then a one-line overall verdict. Only paste raw command output for a step
that **fails** — for passing steps, just say so in one line. This keeps
the report skimmable; nobody needs to see a clean `tsc` run.

## Steps, in order

1. **Uncommitted changes**
   ```
   git status --porcelain
   ```
   Report what's staged/unstaged/untracked. Not a pass/fail gate by
   itself — just context so the user knows what a push would actually
   include. Flag anything that looks like it shouldn't be committed
   (stray `.env` files, credentials, build artifacts) — this repo's
   `.gitignore` already covers the known cases, so a hit here is worth a
   second look, not an assumption of malice.

2. **TypeScript**
   ```
   npx tsc --noEmit -p tsconfig.json
   ```
   PASS = no output. FAIL = paste the errors.

3. **ESLint**
   ```
   npx eslint .
   ```
   PASS = no output. FAIL = paste the errors. Remember this repo's own
   trap: `react/no-unescaped-entities` fails on a plain apostrophe in JSX
   text — a real, recurring source of build failures here, not a
   theoretical one.

4. **Test suite**
   ```
   npm test
   ```
   Report the pass/fail/skip counts from the final summary line. If any
   test in `tests/security.rls.test.ts` shows as **skipped** rather than
   passing, that means `.env.local` wasn't present or didn't have
   Supabase credentials — flag this explicitly (see step 6), don't let it
   silently read as "all fine."

5. **Production build**
   ```
   npm run build
   ```
   PASS = build completes and prints the route table. FAIL = paste the
   error. A build failure here is the single most release-blocking
   result in this whole checklist — say so plainly if it happens.

6. **Live RLS/RPC regression suite** (only if `.env.local` exists at the
   repo root)
   ```
   node --test tests/security.rls.test.ts
   ```
   This is the one check in this list that talks to the real Supabase
   project, not just local code — it's what actually proves the
   privileged-function lockdown and RLS policies are enforced live, per
   `docs/security-audit.md`. If `.env.local` is missing, say clearly that
   this step was skipped and *why* (no local credentials) rather than
   omitting it — a skipped security check should never look identical to
   a passed one in the report.

   If it fails, **check the error text before reporting a regression**:
   a failure whose message is `TypeError: fetch failed` /
   `getaddrinfo ENOTFOUND ...supabase.co` (or the same for
   `registry.npmjs.org` in step 7) means the local machine currently has
   no network path out, not that a lockdown broke. This is a real,
   observed failure mode in this dev environment, not a hypothetical —
   re-run once after confirming connectivity before treating it as a
   finding. A genuine regression looks like an assertion failing against
   a real response (e.g. expected `/permission denied/i`, got something
   else) — that's the one worth reporting as an actual problem.

7. **Dependency audit** (report only — never auto-fix as part of this
   checklist; a dependency upgrade needs its own considered pass, see
   `08-deferred-risks-and-recommendations.md` in the audit docs for why)
   ```
   npm audit --omit=dev
   ```
   Report the advisory count and severities. If it matches the
   already-known, already-documented Next.js→postcss/sharp advisories
   (no safe fix exists in the current Next major — confirmed via
   `npm audit fix --force` finding only a breaking downgrade to
   `next@9.3.3`), say so and don't re-litigate it. If a **new** advisory
   shows up that isn't that one, flag it clearly — that's a real change
   worth the user's attention.

8. **Raw database-error leak check**

   This repo has a specific, previously-fixed vulnerability class
   (SEC-008): a route catching a Supabase/Postgres error and returning
   `error.message` straight to the client, which can leak schema/
   constraint details. It's fixed everywhere as of the audit branch, and
   this check exists to catch a *regression* — a new route written the
   old way.

   ```
   grep -rn "rror\.message" app/api --include=route.ts
   ```

   (Use the broader `rror\.message` pattern, not `error\.message` — the
   narrower pattern misses variable names like `uploadError.message` or
   `typesError.message`, which is exactly the gap that let 5 real
   instances slip past the original sweep. Don't repeat that mistake.)

   For every hit, check whether it's one of the two safe shapes:
   - Passed only to `logError(...)` or `safeErrorResponse(...)` (server-
     side only, never reaches the client response) — safe, ignore.
   - A **deliberately** safe, pre-written message being passed through
     as-is (e.g. a DB trigger's own user-facing text, or a mapped
     `SOME_ERROR_MESSAGES[code]` lookup with a generic fallback for the
     unmapped case) — safe, ignore. You can tell these apart from a real
     leak because the surrounding code visibly branches on a specific
     known error/code rather than blindly forwarding whatever came back.

   Anything else — a raw `error.message` (or `xxxError.message`) handed
   directly to `NextResponse.json(...)` without going through
   `safeErrorResponse`/`logError` first — is a regression. Report the
   file and line, and suggest the exact fix (wrap it with
   `safeErrorResponse("<route>.<action>", error)` from `lib/apiError.ts`,
   importing it if not already imported), but don't apply the fix
   without the user's go-ahead — this checklist is a report, not an
   auto-fixer.

## Report format

```
## Pre-Release Checklist — <date>

| Check | Result |
|---|---|
| git status | <clean / N files changed — see below> |
| TypeScript | PASS / FAIL |
| ESLint | PASS / FAIL |
| Tests | PASS (N/N) / FAIL (N/N, M failing) |
| Build | PASS / FAIL |
| Live RLS/RPC suite | PASS (N/N) / SKIPPED (no .env.local) / FAIL |
| Dependency audit | N advisories (all previously known) / N advisories (NEW: ...) |
| Raw-error-leak check | Clean / N regression(s) found — see below |

**Verdict:** Safe to push / Not safe to push — <one-sentence reason>
```

Only expand into detail (raw output, file/line lists, suggested diffs)
for the rows that aren't a clean pass — keep the passing rows to one
line each.
