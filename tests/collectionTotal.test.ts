import assert from "node:assert/strict";
import test from "node:test";
import { calculateCollectionTotal, resolveActivePrice } from "../lib/format.ts";

test("resolveActivePrice uses the variant's price override when present", () => {
  assert.equal(resolveActivePrice({ price: 500 }, { priceOverride: 450 }), 450);
});

test("resolveActivePrice falls back to the product's own (already-active) price with no variant", () => {
  assert.equal(resolveActivePrice({ price: 500 }), 500);
  assert.equal(resolveActivePrice({ price: 500 }, {}), 500);
});

test("calculateCollectionTotal sums the active price of every product in the collection", () => {
  const products = [{ price: 250 }, { price: 899.5 }, { price: 100 }];
  assert.equal(calculateCollectionTotal(products), 1249.5);
});

test("calculateCollectionTotal resolves each product's price through the supplied variant lookup", () => {
  const products = [
    { id: "a", price: 500 },
    { id: "b", price: 300 },
  ];
  const overrides: Record<string, number> = { a: 450 };
  const total = calculateCollectionTotal(products, (product) =>
    product.id in overrides ? { priceOverride: overrides[product.id] } : undefined
  );
  assert.equal(total, 450 + 300);
});

test("calculateCollectionTotal returns 0 for an empty collection", () => {
  assert.equal(calculateCollectionTotal([]), 0);
});

test("calculateCollectionTotal avoids floating-point drift across many fractional prices", () => {
  const products = Array.from({ length: 10 }, () => ({ price: 10.1 }));
  assert.equal(calculateCollectionTotal(products), 101);
});
