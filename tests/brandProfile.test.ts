import test from "node:test";
import assert from "node:assert/strict";
import { aggregateBrandRatings, discountPercentage, filterCollectionsByBrand, filterProductsForBrand, isActiveOffer, resolveBrandProfileRoute } from "../lib/brandProfile.ts";

test("resolves real brand routes and defaults legacy routes to products", () => {
  assert.equal(resolveBrandProfileRoute("/brands/marga/reviews"), "reviews");
  assert.equal(resolveBrandProfileRoute("/brands/marga"), "products");
});

test("only lower, in-stock compare-at prices qualify as active offers", () => {
  assert.equal(isActiveOffer({ price: 80, compareAtPrice: 100, inStock: true }), true);
  assert.equal(isActiveOffer({ price: 100, compareAtPrice: 100, inStock: true }), false);
  assert.equal(isActiveOffer({ price: 80, compareAtPrice: 100, inStock: false }), false);
});

test("calculates a guarded rounded discount percentage", () => {
  assert.equal(discountPercentage(75, 100), 25);
  assert.equal(discountPercentage(120, 100), 0);
  assert.equal(discountPercentage(10, 0), 0);
});

test("filters products and complete collection tiles to real brand data", () => {
  assert.deepEqual(filterProductsForBrand([{ brand: "Nola", id: 1 }, { brand: "Other", id: 2 }], "nola"), [{ brand: "Nola", id: 1 }]);
  assert.deepEqual(filterCollectionsByBrand([{ image: "/a.jpg", title: "Look 1", href: "#" }, { image: "", title: "Incomplete", href: "#" }]), [{ image: "/a.jpg", title: "Look 1", href: "#" }]);
});

test("aggregates ratings using review count as weight", () => {
  assert.deepEqual(aggregateBrandRatings([{ rating: 5, reviewCount: 2 }, { rating: 3, reviewCount: 1 }]), { average: 13 / 3, reviewCount: 3 });
  assert.deepEqual(aggregateBrandRatings([]), { average: 0, reviewCount: 0 });
});
