# Repository Organization Report — 2026-08-04

## Summary

No file moves, renames, or deletions were made this pass. The repository
is already reasonably organized (see "Existing organizational principles"
below), and the task's own rules are conservative about reorganization
("do not perform a mass folder rewrite," "prefer removing confirmed dead
files over moving stable ones," don't touch anything a protected branch
depends on). Given the very large number of active parallel worktrees and
long-lived feature branches found in the preflight (8 worktrees, 20 local
branches, several behind main by 30+ commits), moving or renaming any
currently-used file risks breaking an in-flight branch's merge — the
safer, still-valuable action this pass was: (1) find genuinely dead
files, and (2) fix small, unambiguous hygiene gaps.

## Change made: `.gitignore`

Added `.idea/` and `*.iml` (see root `.gitignore`). `apps/mobile/.idea/workspace.xml`
showed up as an untracked file in `git status` (not `.gitignore`-ignored),
meaning a future `git add -A` in that directory could accidentally commit
local JetBrains IDE workspace state. This is a pure ignore-list addition —
it does not move, touch, or delete any file (including no mobile files),
and does not affect any tracked path.

## Dead-file search: no confirmed-dead files found this pass

Searched for the "duplicate helpers," "unused exports," and "orphaned
component" categories described in the task. Given the size of the
codebase (87 API routes, 100+ components) and this pass's time budget,
this was a targeted search rather than an exhaustive one:

- No `*.bak`, `*.orig`, `- Copy`, `*.tmp`, or numbered-duplicate files are
  tracked in Git (`git ls-files` search came back empty for those
  patterns).
- The two screenshot directories (`artifacts/mobile-screenshots/`,
  `docs/screenshots/`) are **not** accidental — both are organized,
  sequentially named, and `artifacts/mobile-screenshots/` has its own
  `README.md` explaining its purpose (mobile QA evidence). These are
  intentional documentation, not cleanup targets.
- No stray root-level log files are tracked (`*.log` is `.gitignore`d and
  the actual `.codex-*.log` files present locally are correctly ignored,
  not tracked).
- A full unused-export/dead-code sweep (e.g. with `ts-prune` or
  equivalent) was **not** run this pass — no such tool is currently in
  the repo's devDependencies, and installing a new one "merely for
  appearance" without a specific finding to justify it isn't warranted
  per the task's own instruction ("do not introduce a new tool merely for
  appearance unless it provides real audit value"). This is listed as a
  `NEXT` recommendation in `08-deferred-risks-and-recommendations.md`.

## Existing organizational principles (already in place, worth preserving)

The codebase already follows a clear domain-oriented structure that this
pass did not need to change:

- `content/` (static editorial copy) vs. `lib/data/` (live Supabase reads)
  — an intentional split, documented in `CLAUDE.md`, not a duplication to
  consolidate.
- `lib/admin/` — admin/brand-portal business logic (`productValidation.ts`,
  `productPersistence.ts`, `variantPersistence.ts`, `shippingPolicy.ts`,
  etc.), separate from `lib/data/` (public storefront reads).
- `app/api/admin/**` vs. `app/api/brand-portal/**` — cleanly separated by
  route group, matching the two different authorization models
  (`requireStaffRole` vs. `requireBrandOwner`).
- `types/index.ts` — single shared type file, as documented in
  `CLAUDE.md` ("don't redefine types locally in components").
- `components/shared/` — cross-cutting UI, already the designated home
  for anything used by both the main site and brand pages.
- `supabase/migrations/` — one file per change, ordered by timestamp
  prefix, forward-only (this pass's own migration follows the same
  convention: `20260804000001_scope_product_child_table_rls.sql`).
- `docs/` — flat `.md` files at the root for platform-wide audits/design
  notes, with a `docs/screenshots/` subfolder for image evidence. This
  audit's own output follows the same pattern
  (`docs/audits/2026-08-04-security-and-repository-organization/`).

## Protected areas confirmed untouched

- `apps/mobile/**` — inspected only (see
  `06-protected-mobile-work-report.md`), zero files modified, moved, or
  deleted.
- `codex/website-design-preview` branch and commit `73fc131` — inspected
  via `git log`/`git diff`/`git merge-tree` only, from the current
  branch; the branch itself was never checked out, never modified, never
  merged, never rebased.
- No worktree listed by `git worktree list` was modified, and none was
  removed.
- No branch, stash, or tag was deleted.

## Files moved

None.

## Files removed

None.

## Duplicate code consolidated

None found and confirmed dead enough to safely consolidate this pass.
