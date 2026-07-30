# Protected Mobile Work Report — 2026-08-04

**No mobile file was modified, moved, renamed, or deleted this pass.**
Everything below is inspection only.

## What's currently on `main`

`apps/mobile/` on `main` (90 tracked files) is a complete, later Expo
Router mobile app: standard `app/` directory routing (not `src/app/`),
covering auth (sign-in/up, password recovery), tabs (home, categories,
search, cart, wishlist, profile), addresses, checkout, order
success/history, brand pages, product listing/detail, reviews
(write/edit), and settings (profile, notifications, appearance). It was
built directly on `main` across ~17 commits from
`73b083e feat(mobile): establish Expo application foundation` through
`32d3478 feat(mobile): animate marketplace background`, then further
integrated by the later variant/inventory rebuild work
(`b44f52a feat: rebuild Inventory & Variants...` also touched
`apps/mobile`). This is the mobile app that should be considered
current/live.

## `chore/mobile-readiness` — a different, older, superseded implementation

This local+remote branch (`chore/mobile-readiness`, tip `74926b7`) is
**not merged into `main`** (`git merge-base --is-ancestor` returns false).
It contains 104 `apps/mobile` files, but comparing file paths against
`main`'s tree shows only 6 files in common — the rest use a completely
different structure: `apps/mobile/src/app/**` (routes nested under
`src/`) instead of `main`'s `apps/mobile/app/**`, a shared
`@mahaly/*` workspace-package architecture (`packages/config`,
`packages/database`, `packages/design-tokens`, `packages/domain`,
`packages/validation` — all of which still exist as ignored/empty
directories per the preflight's `.gitignore` check), its own
`AuthGuard`/`authContext.tsx`/`apiClient.ts`, and its own EAS build
config (`eas.json`, "Milestone 13, internal only" per its own commit
message).

This reads as an earlier, self-contained attempt at the mobile app
(commit history spans "Milestone 1" through "Milestone 13" — a
structured, phased build) that was later **superseded by a full rewrite
directly on `main`** using a different architecture, rather than ever
being merged or rebased forward. It is **not "in progress work that's
missing"** — it looks intentionally abandoned in favor of the newer
approach, but this pass cannot fully confirm intent (no commit or PR
description says so explicitly) — flagged as a judgment call for the
project owner, not treated as fact.

## Worktrees / branches inspected

- `chore/mobile-readiness` — local + remote, not merged (see above).
- No dedicated "mobile" worktree exists in `git worktree list` — the 8
  worktrees found are all for other feature branches
  (`feature/dashboard-product-system-stabilization`,
  `feature/inventory-variants-refinement`,
  `feature/opening-stock-inventory-workflow`,
  `feature/product-editor-experience-rebuild`, `feature/google-auth`,
  plus the `codex/website-design-preview` worktree and a detached
  `.claude/worktrees/worktree-explanation-52af38`). None of them is
  mobile-specific, so no separate "mobile worktree with unmerged
  changes" exists beyond the `chore/mobile-readiness` branch itself.
- One untracked file: `apps/mobile/.idea/workspace.xml` (local JetBrains
  IDE state, not project data — see `03-repository-organization-report.md`
  for the `.gitignore` fix that prevents this from ever being accidentally
  committed).

## Could shared web changes break mobile?

This session's own web changes (Product Editor refinements — Description
800-char limit/toolbar, Care Instructions/Materials grouping, automatic
New Arrivals via `lib/newArrivals.ts`, Featured moved to admin-list-only)
touch `lib/data/products.ts`'s public shape (`isNew` is now always
present and computed, `featured` unchanged) and `types/index.ts`. Mobile
reads product data via its own `apps/mobile/src/domain/products.ts` and
Supabase queries — it was not touched, and the storefront's public
`Product`/`ProductRecord` field additions are additive (new optional
field, no field removed or renamed), so this should not break mobile's
existing queries. **Not independently runtime-tested against the mobile
app** — flagged as a manual verification step.

The RLS-016 migration in this branch (see `01-security-audit-report.md`)
tightens read access to 4 tables mobile also queries
(`product_variant_values`, confirmed via
`apps/mobile/src/domain/products.ts:145`). Since the new policy still
allows the same rows the app is supposed to show (published,
non-paused), this should be transparent to mobile — mobile only ever
queries variant values for products it already knows are published. Not
independently runtime-verified against a running mobile client.

## Mobile security concerns found

None new. The mobile app's auth bridge (`getRequestUser()` in
`lib/supabase/requestUser.ts`, used by `app/api/account/**` and related
routes) correctly verifies a Bearer token server-side via
`supabaseAdmin.auth.getUser(token)` rather than trusting any
client-asserted user id — reviewed as part of the API authorization
matrix (`04-api-authorization-matrix.md`).

## Mobile build/type-check status

`cd apps/mobile && npx tsc --noEmit -p tsconfig.json` (read-only, no
files changed):

```
app/(tabs)/categories.tsx(28,35): error TS2339: Property 'categories' does not exist on type 'NoInfer<CatalogFacets>'.
app/(tabs)/categories.tsx(28,58): error TS7006: Parameter 'slug' implicitly has an 'any' type.
app/(tabs)/categories.tsx(30,57): error TS7006: Parameter 'letter' implicitly has an 'any' type.
```

3 pre-existing type errors, all in one file
(`apps/mobile/app/(tabs)/categories.tsx`), unrelated to any change in
this branch (this branch touches zero mobile files). **Not fixed** — per
this task's explicit rule ("do not attempt to 'finish' incomplete mobile
work"), reported only.

## Recommended next actions (mobile)

- Decide the fate of `chore/mobile-readiness` explicitly (archive/delete
  the branch, or confirm it's truly superseded) rather than leaving it
  ambiguous — this is a product/ownership decision, not something this
  audit should decide unilaterally.
- Fix the 3 `categories.tsx` type errors in a dedicated mobile-focused
  session.
- Add a mobile type-check step to CI (none exists currently — see
  `08-deferred-risks-and-recommendations.md`).
