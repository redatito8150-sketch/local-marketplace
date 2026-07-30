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

test("a Matrix-created variant is not blocked by a stale/empty allowedCombinations array", () => {
  // allowedCombinations is a leftover client-state field from the old
  // "Generate Variants + Allowed Combination Builder" flow. The Matrix +
  // Drawer never populate it, so it stays whatever it was initialized to
  // (typically []) even as real variants are created — validation must not
  // require it to match body.variants.
  const issues = validateProductSections({
    ...validProduct,
    optionTypeIds: ["color-type", "size-type"],
    valueIdsByOptionType: { "color-type": ["red"], "size-type": ["m"] },
    allowedCombinations: [],
    variants: [{ optionValueIds: ["red", "m"], quantity: 5, sellingStatus: "active" }],
    colorOptionTypeId: "color-type",
  });
  assert.deepEqual(issues, []);
});

test("publishing a single-color product does not require a dedicated Color image", () => {
  const issues = validateProductSections({
    ...validProduct,
    status: "published",
    optionTypeIds: ["color-type"],
    valueIdsByOptionType: { "color-type": ["red"] },
    colorOptionTypeId: "color-type",
    colorImages: {},
    variants: [{ optionValueIds: ["red"], quantity: 5, sellingStatus: "active" }],
  });
  assert.ok(!issues.some((issue) => issue.fieldId === "product-media" && /color/i.test(issue.message)));
});

test("publishing a multi-color product blocks on any color missing its mapped image", () => {
  const issues = validateProductSections({
    ...validProduct,
    status: "published",
    optionTypeIds: ["color-type"],
    valueIdsByOptionType: { "color-type": ["red", "white"] },
    colorOptionTypeId: "color-type",
    colorImages: { red: "https://images.unsplash.com/red.jpg" },
    variants: [
      { optionValueIds: ["red"], quantity: 5, sellingStatus: "active" },
      { optionValueIds: ["white"], quantity: 5, sellingStatus: "active" },
    ],
  });
  assert.ok(issues.some((issue) => issue.section === "media" && issue.fieldId === "product-media" && /color/i.test(issue.message)));
});

test("multi-color image requirement does not block Save as Draft", () => {
  const issues = validateProductSections({
    ...validProduct,
    status: "draft",
    optionTypeIds: ["color-type"],
    valueIdsByOptionType: { "color-type": ["red", "white"] },
    colorOptionTypeId: "color-type",
    colorImages: {},
    variants: [
      { optionValueIds: ["red"], quantity: 5, sellingStatus: "active" },
      { optionValueIds: ["white"], quantity: 5, sellingStatus: "active" },
    ],
  });
  assert.ok(!issues.some((issue) => issue.fieldId === "product-media" && /color/i.test(issue.message)));
});

test("the 'Complete' badge reflects true publish-readiness, not just the current Draft/Published status", () => {
  // A multi-color product missing a Color image only becomes a validation
  // issue at status: "published" — Media must never show as Complete for
  // it while still in Draft, or the badge lies about readiness.
  const source = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  assert.match(source, /publishReadinessIssues\s*=\s*validateProductSections\(buildPayload\("published"\)\)/);
  assert.match(source, /completedSections[\s\S]{0,120}publishReadinessIssues/);
});

test("issue count only counts required issues, and each section shows a hoverable '!' with the missing items", () => {
  const source = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  assert.match(source, /const required = issues\.filter\(\(issue\) => !issue\.optional\);/);
  assert.match(source, /group-hover:block group-focus-visible:block/);
  assert.match(source, /role="tooltip"/);
});

test("top and bottom actions share the same submit handlers", () => {
  const source = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  assert.ok((source.match(/onSaveDraft=\{\(\) => submit\("draft"\)\}/g) ?? []).length >= 2);
  assert.ok((source.match(/onPublish=\{\(\) => submit\("published"\)\}/g) ?? []).length >= 2);
});

test("Variants is one unified Color-first table: no Generate Variants, no Cartesian builder, no Drawer, no second review table", () => {
  const source = readFileSync(new URL("../components/admin/InventoryVariantsSection.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Generate Variants/);
  assert.doesNotMatch(source, /AllowedCombinationBuilder/);
  assert.doesNotMatch(source, /VariantMatrix/);
  assert.doesNotMatch(source, /VariantTree/);
  assert.doesNotMatch(source, /VariantDrawer/);
  assert.match(source, /VariantTable/);
});

test("the Live Preview is never replaced by a Drawer: it renders unconditionally in the Product Editor", () => {
  const formSource = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(formSource, /VariantDrawer/);
  assert.doesNotMatch(formSource, /activeVariantCell/);
  assert.match(formSource, /<ProductLivePreview/);
});
