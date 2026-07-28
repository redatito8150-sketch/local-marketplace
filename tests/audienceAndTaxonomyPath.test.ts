import assert from "node:assert/strict";
import test from "node:test";
import { shopCategoryAudiences, primaryShopCategoryForAudience } from "../lib/audience.ts";
import { resolveTaxonomyPath } from "../lib/taxonomyPath.ts";
import type { TaxonomyNode } from "../types/index.ts";

test("shopCategoryAudiences: women/men shop sections include unisex, kids does not", () => {
  assert.deepEqual(shopCategoryAudiences("women"), ["women", "unisex"]);
  assert.deepEqual(shopCategoryAudiences("men"), ["men", "unisex"]);
  assert.deepEqual(shopCategoryAudiences("kids"), ["kids_baby"]);
});

test("primaryShopCategoryForAudience: unisex lands on women, kids_baby lands on kids", () => {
  assert.equal(primaryShopCategoryForAudience("women"), "women");
  assert.equal(primaryShopCategoryForAudience("men"), "men");
  assert.equal(primaryShopCategoryForAudience("unisex"), "women");
  assert.equal(primaryShopCategoryForAudience("kids_baby"), "kids");
});

const tree: TaxonomyNode[] = [
  { id: "main-clothing", parentId: null, level: 1, name: "Clothing", slug: "clothing", sortOrder: 1, isActive: true },
  { id: "group-tops", parentId: "main-clothing", level: 2, name: "Tops", slug: "tops", sortOrder: 1, isActive: true },
  { id: "type-tshirts", parentId: "group-tops", level: 3, name: "T-Shirts", slug: "t-shirts", sortOrder: 1, isActive: true },
  { id: "type-inactive", parentId: "group-tops", level: 3, name: "Retired Type", slug: "retired", sortOrder: 2, isActive: false },
];

test("resolveTaxonomyPath resolves a Level 3 id to its full Main Category / Group / Type path", () => {
  assert.deepEqual(resolveTaxonomyPath(tree, "type-tshirts"), {
    mainCategory: "Clothing",
    productGroup: "Tops",
    productTypeName: "T-Shirts",
  });
});

test("resolveTaxonomyPath still resolves an inactive node (display, not selection, context)", () => {
  assert.deepEqual(resolveTaxonomyPath(tree, "type-inactive"), {
    mainCategory: "Clothing",
    productGroup: "Tops",
    productTypeName: "Retired Type",
  });
});

test("resolveTaxonomyPath returns null for a missing/null id", () => {
  assert.equal(resolveTaxonomyPath(tree, null), null);
  assert.equal(resolveTaxonomyPath(tree, undefined), null);
  assert.equal(resolveTaxonomyPath(tree, "does-not-exist"), null);
});

test("resolveTaxonomyPath returns null for a non-Level-3 id (Main Category/Group ids are never valid product_type_id values)", () => {
  assert.equal(resolveTaxonomyPath(tree, "main-clothing"), null);
  assert.equal(resolveTaxonomyPath(tree, "group-tops"), null);
});
