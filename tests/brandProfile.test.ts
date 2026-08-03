import test from "node:test";
import assert from "node:assert/strict";
import { aggregateBrandRatings, filterProductsForBrand, resolveBrandProfileRoute } from "../lib/brandProfile.ts";

test("resolves real brand routes and defaults legacy routes to products", () => {
  assert.equal(resolveBrandProfileRoute("/brands/marga/reviews"), "reviews");
  assert.equal(resolveBrandProfileRoute("/brands/marga"), "products");
});

test("filters products to real brand data", () => {
  assert.deepEqual(filterProductsForBrand([{ brand: "Nola", id: 1 }, { brand: "Other", id: 2 }], "nola"), [{ brand: "Nola", id: 1 }]);
});

test("aggregates ratings using review count as weight", () => {
  assert.deepEqual(aggregateBrandRatings([{ rating: 5, reviewCount: 2 }, { rating: 3, reviewCount: 1 }]), { average: 13 / 3, reviewCount: 3 });
  assert.deepEqual(aggregateBrandRatings([]), { average: 0, reviewCount: 0 });
});
