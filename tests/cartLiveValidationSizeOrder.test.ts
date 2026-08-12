import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// lib/cart/liveValidation.ts makes a real Supabase network call, so it
// can't be exercised with a plain unit test the way lib/inventory/
// sizeOrder.ts's own comparator functions are (see tests/sizeOrder.test.ts
// for those) — static source verification is the established pattern for
// this kind of client-side, network-bound module elsewhere in this suite.
//
// Before this fix, entry.variants (and therefore the cart page's size
// switcher, built by filtering/mapping over it) came back in whatever
// order the DB query happened to return — not the canonical S/M/L/XL (or
// brand-custom) order used by the product page and Variants Matrix.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

const liveValidation = read("lib/cart/liveValidation.ts");

test("variants are sorted with compareSizeOrderables — the same comparator lib/data/products.ts uses for the product page's sizes", () => {
  assert.match(liveValidation, /import \{ compareSizeOrderables \} from "@\/lib\/inventory\/sizeOrder"/);
  const variantsBlockMatch = liveValidation.match(/variants: variants\s*\.map\(\(v\) => \{[\s\S]*?\.sort\(\(a, b\) =>\s*compareSizeOrderables\([\s\S]*?\)\s*\),/);
  assert.ok(variantsBlockMatch, "expected the variants array to be built with a trailing .sort(compareSizeOrderables(...))");
});

test("the sort key carries real sortOrder/brandId from the Size option value, not a guessed text order", () => {
  assert.match(liveValidation, /sizeSortOrder: sizeOption\?\.sortOrder/);
  assert.match(liveValidation, /sizeBrandId: sizeOption\?\.brandId/);
});
