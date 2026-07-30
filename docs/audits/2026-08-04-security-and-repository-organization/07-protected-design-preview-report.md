# Protected Design Preview Report — 2026-08-04

**The `codex/website-design-preview` branch was inspected only — never
checked out, modified, merged, rebased, or cherry-picked from.**

## Availability

- Branch exists locally and on `origin` (`origin/codex/website-design-preview`).
- Checkpoint commit `73fc131` (`feat: save website design preview`) exists
  and matches the branch tip.
- The local branch is 1 commit ahead of its own `origin` copy (`73fc131`
  itself hasn't been pushed) — a separate `.codex` worktree
  (`C:/Users/pc/.codex/worktrees/5e8e/local-marketplace-clean`) currently
  has this branch checked out; that worktree was left untouched.

## Scope, relative to `main`

5 commits on top of merge-base `32d3478` (an older point in `main`'s
history — `main` has since moved on through the mobile-animation and
Product Editor rebuild work):

```
fe3aff9 feat(web): add Nile homepage design preview
6b4467b feat(web): extend homepage background gradient
92d528b feat(web): animate homepage entrance
b7710d9 feat(web): replace homepage background artwork
4bd009c feat(web): simplify homepage header and hero
```

`git diff <merge-base> codex/website-design-preview --stat`: 44 files
changed, 561 insertions(+), 283 deletions(-).

## Files/routes/components affected

Entirely homepage and Join-as-a-Brand visual work — no admin, brand
portal, checkout, or account code is touched:

- `app/page.tsx` (homepage), `app/join-as-a-brand/page.tsx`,
  `app/join-as-a-brand/apply/page.tsx`
- `components/Header.tsx`, `components/Footer.tsx`,
  `components/Hero.tsx`, `components/ShopByMood.tsx`,
  `components/Sponsored.tsx`, `components/shared/Logo.tsx`,
  `components/shared/CompactProductCard.tsx`
- `components/home/NewArrivalsSection.tsx`,
  `components/home/PageStudioHomepage.tsx`,
  `components/home/PageStudioProductGridSection.tsx`
- `components/join/*` (ApplyBrandForm, BrandDashboardPreview,
  JoinBenefits, JoinHero, JoinJourney)
- `content/home.ts`, `content/join.ts`, `content/shopByMood.ts`
- `lib/data/products.ts` (small change, needs review — see below)
- `app/globals.css`, `.gitignore`
- 21 new binary image assets under `public/images/home/**` and
  `public/images/join/brand-story/**`, plus a replaced `public/logo.png`.

## Unmerged functional changes

`lib/data/products.ts` has a 12-line diff on this branch that is **not
purely visual** — it wasn't reviewed line-by-line this pass (the branch
itself was intentionally not opened for editing/deep review, only
diffed), so whether it's a display-only tweak or an actual data-layer
behavior change is unverified. Flagged explicitly rather than assumed
either way — **this is the one thing worth a closer look before treating
the rest of the branch as "pure design, no functional risk."**

## Conflict with current `main`

`git merge-tree <merge-base> main codex/website-design-preview` produced
no conflict markers — a mechanical 3-way merge would apply cleanly today.
This is **not** a semantic review (it doesn't mean the resulting UI would
look/behave correctly given everything `main` has changed since the
merge-base, especially the Product Editor and mobile work) — it only
means Git's text-level merge wouldn't hit a conflicting hunk.

## Security or correctness concerns found inside it

None that rise to a security finding — this is homepage visual/content
work. The one item worth a human look is the `lib/data/products.ts`
diff noted above, purely because it's the one non-visual file in the
diff, not because anything in it was observed to be wrong.

## Recommendation for evaluating/merging later

1. Have whoever owns this design work review the `lib/data/products.ts`
   diff specifically and confirm it's either a no-op for `main`'s current
   state or intentionally desired.
2. Given the merge-base is now several major features behind `main`
   (mobile animation, Product Editor rebuild, this session's New
   Arrivals/Featured/Description work), a straight merge is not
   recommended even though it's textually conflict-free — rebasing the
   design work onto current `main` first (by whoever owns that branch,
   not by this audit) would surface any real integration issues that a
   clean 3-way merge-tree check can't.
3. Do not merge as part of this or any audit branch — this stays a
   product/design decision.
