import assert from "node:assert/strict";
import test from "node:test";
import { parseCatalogFilterValues } from "../lib/catalogQuery.ts";

test("parses, trims, and de-duplicates catalog filter values", () => {
  assert.deepEqual(parseCatalogFilterValues("Clothing, Shoes,Clothing"), ["Clothing", "Shoes"]);
});

test("rejects PostgREST control characters from catalog filters", () => {
  assert.deepEqual(parseCatalogFilterValues("Clothing,price.gt.0,(unsafe),Safe Brand"), ["Clothing", "Safe Brand"]);
});

test("caps the number of values accepted per filter", () => {
  const values = Array.from({ length: 30 }, (_, index) => `Brand ${index}`).join(",");
  assert.equal(parseCatalogFilterValues(values).length, 20);
});
