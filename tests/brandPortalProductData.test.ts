import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Brand Portal product list derives stock from variants, never the removed products.in_stock column", async () => {
  const source = await readFile(
    new URL("../lib/data/brandPortal.ts", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /row\.in_stock|featured,\s*in_stock/);
  assert.match(source, /getVariantsForProducts\(rows\.map/);
  assert.match(source, /variant\.sellingStatus === "active" && variant\.quantity > 0/);
});
