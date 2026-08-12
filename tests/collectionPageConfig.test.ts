import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTION_PAGE_CONFIGS } from "../components/category/collectionPageConfig.ts";

// The Women hero previously showed no products at all whenever any of its
// 5 hardcoded featuredProductIds no longer matched a real catalog product
// (renamed/removed since the config was written) — Men and Kids already
// had allowProductFallback: true to backfill with real products in that
// case, Women simply didn't. CollectionHero.tsx's featuredItems memo:
// `if (!config.allowProductFallback || configured.length === 5) return configured;`
// — without the flag, a stale id just silently shrinks the shown list
// instead of ever being backfilled.
test("every collection page config allows falling back to real catalog products when a hardcoded featured id goes stale", () => {
  for (const config of Object.values(COLLECTION_PAGE_CONFIGS)) {
    assert.equal(
      config.allowProductFallback,
      true,
      `${config.slug} must set allowProductFallback: true, or a stale featuredProductIds entry silently empties the hero`
    );
  }
});

// CollectionHero.tsx indexes config.placements[index] positionally against
// featuredItems (up to 5 entries) — fewer than 5 placements would leave a
// backfilled product with no placement (undefined.className crashes).
test("every collection page config declares exactly 5 featuredProductIds and 5 placements", () => {
  for (const config of Object.values(COLLECTION_PAGE_CONFIGS)) {
    assert.equal(config.featuredProductIds.length, 5, `${config.slug} featuredProductIds`);
    assert.equal(config.placements.length, 5, `${config.slug} placements`);
  }
});
