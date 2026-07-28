import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validateProductSections, type ProductInput } from "../lib/admin/productValidation.ts";

const validProduct: ProductInput = {
  name: "Structured Shirt",
  brandId: "brand-1",
  productTypeId: "type-1",
  audience: "unisex",
  price: 500,
  compareAtPrice: 600,
  currency: "EGP",
  image: "https://images.unsplash.com/photo.jpg",
  images: [],
  description: "A complete product description.",
  details: [],
  careInstructions: [],
  shippingReturns: "",
  isNew: false,
  featured: false,
  status: "draft",
  defaultLowStockThreshold: 5,
  optionTypeIds: [],
  valueIdsByOptionType: {},
  allowedCombinations: [[]],
  variants: [{ optionValueIds: [], quantity: 1, sellingStatus: "active" }],
  colorImages: {},
};

test("structured product validation groups issues by editor section and field anchor", () => {
  const issues = validateProductSections({
    ...validProduct,
    name: "",
    price: -1,
    compareAtPrice: 0,
    image: "",
    description: "",
  });
  assert.ok(issues.some((issue) => issue.section === "basic" && issue.fieldId === "product-name"));
  assert.ok(issues.some((issue) => issue.section === "pricing" && issue.fieldId === "product-price"));
  assert.ok(issues.some((issue) => issue.section === "media" && issue.fieldId === "product-media"));
  assert.ok(issues.some((issue) => issue.section === "details" && issue.fieldId === "product-description"));
});

test("a valid product produces no editor section issues", () => {
  assert.deepEqual(validateProductSections(validProduct), []);
});

test("publish readiness is reported inside Inventory & Variants", () => {
  const issues = validateProductSections({
    ...validProduct,
    status: "published",
    variants: [{ optionValueIds: [], quantity: 0, sellingStatus: "active" }],
  });
  assert.ok(issues.some((issue) => issue.section === "inventory" && /stock/i.test(issue.message)));
});

test("the shared editor shell exposes all six sections and reliable active-section tracking", () => {
  const formSource = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  const chromeSource = readFileSync(new URL("../components/admin/ProductEditorChrome.tsx", import.meta.url), "utf8");
  for (const section of ["basic", "pricing", "media", "inventory", "details", "visibility"]) {
    assert.match(formSource, new RegExp(`sectionId="${section}"`));
  }
  assert.match(formSource, /IntersectionObserver/);
  assert.match(formSource, /beforeunload/);
  assert.match(chromeSource, /ProductEditorHeader/);
  assert.match(chromeSource, /ProductEditorBottomBar/);
  assert.match(chromeSource, /ProductErrorSummary/);
});

test("top and bottom actions share the same submit handlers", () => {
  const source = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  assert.ok((source.match(/onSaveDraft=\{\(\) => submit\("draft"\)\}/g) ?? []).length >= 2);
  assert.ok((source.match(/onPublish=\{\(\) => submit\("published"\)\}/g) ?? []).length >= 2);
});
