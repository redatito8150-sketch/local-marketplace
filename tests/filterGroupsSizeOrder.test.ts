import assert from "node:assert/strict";
import test from "node:test";
import { buildDynamicFilterGroups } from "../lib/filters.ts";
import type { Product } from "../types/index.ts";

// buildDynamicFilterGroups feeds the filter sidebar shared by /shop/
// [category] and the brand page (components/category/CategoryShoppingArea.tsx
// and components/brand/BrandShoppingArea.tsx, both via
// lib/hooks/useProductFilters.ts). Before this fix, the "Size" group's
// options were sorted by how many products had that size (most common
// first) — the same generic "popularity" sort every other filter group
// legitimately uses — which produces an effectively random-looking order
// for something that has one obvious correct order (S, M, L, XL...).

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    category: "women",
    brand: "Noori",
    brandSlug: "noori",
    name: "Test Product",
    price: 500,
    currency: "EGP",
    rating: 5,
    reviewCount: 0,
    image: "img.png",
    sizes: [],
    colors: [],
    inStock: true,
    productTypeId: "type-1",
    mainCategory: "Clothing",
    productGroup: "Tops",
    productTypeName: "Shirts",
    audience: "women",
    ...overrides,
  };
}

test("the Size filter group is ordered S/M/L/XL..., not by how many products have each size", () => {
  // Deliberately given in an order where "most popular first" and
  // "correct size order" disagree: L appears on 3 products (most
  // popular), XS on only 1 — a popularity sort would put L before XS,
  // the correct size order must not.
  const products = [
    product({ id: "p1", sizes: ["L"] }),
    product({ id: "p2", sizes: ["L", "XS"] }),
    product({ id: "p3", sizes: ["L", "M"] }),
    product({ id: "p4", sizes: ["S", "XL"] }),
  ];
  const groups = buildDynamicFilterGroups(products);
  const sizeGroup = groups.find((g) => g.id === "size");
  assert.ok(sizeGroup, "expected a Size filter group");
  assert.deepEqual(
    sizeGroup!.options.map((o) => o.label),
    ["XS", "S", "M", "L", "XL"]
  );
});

test("counts are still correct even though the sort order changed", () => {
  const products = [
    product({ id: "p1", sizes: ["L"] }),
    product({ id: "p2", sizes: ["L", "XS"] }),
    product({ id: "p3", sizes: ["L", "M"] }),
  ];
  const groups = buildDynamicFilterGroups(products);
  const sizeGroup = groups.find((g) => g.id === "size")!;
  const byLabel = Object.fromEntries(sizeGroup.options.map((o) => [o.label, o.count]));
  assert.equal(byLabel.L, 3);
  assert.equal(byLabel.XS, 1);
  assert.equal(byLabel.M, 1);
});

test("other filter groups (e.g. Brand) are unaffected — still sorted by popularity, not alphabetically/by size logic", () => {
  const products = [
    product({ id: "p1", brand: "Rare Brand" }),
    product({ id: "p2", brand: "Popular Brand" }),
    product({ id: "p3", brand: "Popular Brand" }),
  ];
  const groups = buildDynamicFilterGroups(products);
  const brandGroup = groups.find((g) => g.id === "brand")!;
  assert.deepEqual(
    brandGroup.options.map((o) => o.label),
    ["Popular Brand", "Rare Brand"]
  );
});

test("an unrecognized custom size label sorts to the end rather than breaking the group", () => {
  const products = [product({ id: "p1", sizes: ["M", "Petite Fit", "L"] })];
  const groups = buildDynamicFilterGroups(products);
  const sizeGroup = groups.find((g) => g.id === "size")!;
  assert.deepEqual(sizeGroup.options.map((o) => o.label), ["M", "L", "Petite Fit"]);
});
