import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validateProductSections, type ProductInput } from "../lib/admin/productValidation.ts";
import { assessProductImageDimensions } from "../lib/admin/productImageQuality.ts";

const validProduct: ProductInput = {
  name: "Structured Shirt",
  brandId: "brand-1",
  productTypeId: "type-1",
  audience: "unisex",
  price: 500,
  discountPercent: 20,
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
  launchPolicy: "show_now",
  defaultLowStockThreshold: 5,
  optionTypeIds: [],
  valueIdsByOptionType: {},
  allowedCombinations: [[]],
  variants: [{ optionValueIds: [], quantity: 1, sellingStatus: "active" }],
  colorImages: {},
};

test("structured product validation groups issues by editor section and field anchor", () => {
  // status: "published" — price/image/description are only required once
  // a product is actually going public (see lib/admin/productValidation.ts's
  // requiresCompleteInfo); a Draft is intentionally allowed to skip them.
  const issues = validateProductSections({
    ...validProduct,
    status: "published",
    name: "",
    price: -1,
    discountPercent: 150,
    image: "",
    description: "",
  });
  assert.ok(issues.some((issue) => issue.section === "basic" && issue.fieldId === "product-name"));
  assert.ok(issues.some((issue) => issue.section === "pricing" && issue.fieldId === "product-price"));
  assert.ok(issues.some((issue) => issue.section === "pricing" && issue.fieldId === "product-discount-percent"));
  assert.ok(issues.some((issue) => issue.section === "media" && issue.fieldId === "product-media"));
  assert.ok(issues.some((issue) => issue.section === "details" && issue.fieldId === "product-description"));
});

test("a valid product produces no editor section issues", () => {
  assert.deepEqual(validateProductSections(validProduct), []);
});

// A Draft exists specifically so incomplete work can be saved and finished
// later — only "what kind of product is this" (name/brand/audience/
// category) is required to save one at all.
test("a draft with missing price/image/description/variants produces no issues", () => {
  const issues = validateProductSections({
    ...validProduct,
    status: "draft",
    price: 0,
    image: "",
    description: "",
    variants: [],
  });
  assert.deepEqual(issues, []);
});

test("archiving requires the same completeness as publishing, minus purchasable stock", () => {
  const incomplete = validateProductSections({
    ...validProduct,
    status: "archived",
    price: 0,
    image: "",
    description: "",
  });
  assert.ok(incomplete.some((issue) => issue.fieldId === "product-price"));
  assert.ok(incomplete.some((issue) => issue.fieldId === "product-media"));
  assert.ok(incomplete.some((issue) => issue.fieldId === "product-description"));

  // Complete info, but zero stock — fine for Archived (not for sale right
  // now by definition), unlike Published which would reject this.
  const zeroStock = validateProductSections({
    ...validProduct,
    status: "archived",
    variants: [{ optionValueIds: [], quantity: 0, sellingStatus: "active" }],
  });
  assert.deepEqual(zeroStock, []);
});

test("publish readiness inside Inventory & Variants requires an Active variant, not stock", () => {
  const issues = validateProductSections({
    ...validProduct,
    status: "published",
    variants: [{ optionValueIds: [], quantity: 0, sellingStatus: "paused" }],
  });
  assert.ok(issues.some((issue) => issue.section === "inventory" && /active selling status/i.test(issue.message)));
});

// Product creation/editing is catalog-only now — publishing never requires
// positive stock, for a partner brand or a direct one. Both need exactly
// the same thing: at least one Active variant definition. The actual
// sellable-stock gap closes later through Inventory (direct) or a
// confirmed warehouse receipt (partner), never through this form.
test("a partner brand can publish with 0-stock variants — quantity is never the gate for anyone", () => {
  const issues = validateProductSections({
    ...validProduct,
    status: "published",
    isPartnerBrand: true,
    variants: [{ optionValueIds: [], quantity: 0, sellingStatus: "active" }],
  });
  assert.deepEqual(issues, []);
});

test("a partner brand still needs at least one Active variant to publish", () => {
  const issues = validateProductSections({
    ...validProduct,
    status: "published",
    isPartnerBrand: true,
    variants: [{ optionValueIds: [], quantity: 0, sellingStatus: "paused" }],
  });
  assert.ok(issues.some((issue) => issue.section === "inventory" && issue.fieldId === "generated-variants"));
  assert.ok(!/needs stock and/i.test(issues.find((i) => i.fieldId === "generated-variants")!.message));
});

test("a non-partner (brand_direct) brand publishes fine with 0-stock variants too — the old direct-only stock requirement is gone", () => {
  const issues = validateProductSections({
    ...validProduct,
    status: "published",
    isPartnerBrand: false,
    variants: [{ optionValueIds: [], quantity: 0, sellingStatus: "active" }],
  });
  assert.deepEqual(issues, []);
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
  assert.match(source, /completedSections[\s\S]{0,220}publishReadinessIssues/);
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

test("new products use a six-step wizard with a prominent, reversible customer preview", () => {
  const formSource = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  const chromeSource = readFileSync(new URL("../components/admin/ProductEditorChrome.tsx", import.meta.url), "utf8");
  const previewSource = readFileSync(new URL("../components/admin/ProductLivePreview.tsx", import.meta.url), "utf8");

  assert.match(formSource, /isCreateExperience \? \(/);
  assert.match(formSource, /<ProductWizardBottomBar/);
  assert.match(formSource, /activeSection === "inventory"/);
  assert.doesNotMatch(chromeSource, /label: "Shipping"/);
  assert.equal((chromeSource.match(/number: "[1-6]", label:/g) ?? []).length, 6);
  assert.match(chromeSource, /Preview product/);
  assert.match(chromeSource, /Hide preview/);
  assert.match(previewSource, /Customer preview/);
  assert.match(previewSource, /> Desktop/);
  assert.match(previewSource, /> Mobile/);
});

test("the creation wizard follows the final lifecycle: Draft can publish, but cannot Archive", () => {
  const formSource = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  const chromeSource = readFileSync(new URL("../components/admin/ProductEditorChrome.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(chromeSource, /Keep archived/);
  assert.match(formSource, /canPublish=\{publishReadinessIssues\.length === 0\}/);
  assert.match(formSource, /canArchive=\{form\.status === "published" && publishReadinessIssues\.length === 0\}/);
});

test("brand-portal product creation uses a standalone shell without the portal sidebar", () => {
  const shellSource = readFileSync(new URL("../components/brand-portal/BrandPortalExperienceShell.tsx", import.meta.url), "utf8");
  const layoutSource = readFileSync(new URL("../app/brand-portal/layout.tsx", import.meta.url), "utf8");

  assert.match(shellSource, /pathname === "\/brand-portal\/products\/new"/);
  assert.match(shellSource, /if \(isStandaloneProductCreator\)/);
  assert.match(shellSource, /<main className="min-h-screen/);
  assert.match(layoutSource, /<BrandPortalExperienceShell/);
});

test("option loading distinguishes progress, retryable failure, and missing administrator setup", () => {
  const formSource = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  const inventorySource = readFileSync(new URL("../components/admin/InventoryVariantsSection.tsx", import.meta.url), "utf8");

  assert.match(formSource, /optionLoadState/);
  assert.match(formSource, /onRetryOptions=\{loadOptions\}/);
  assert.match(inventorySource, /Loading colors and sizes/);
  assert.match(inventorySource, /Colors and sizes could not be loaded/);
  assert.match(inventorySource, /Try again/);
  assert.match(inventorySource, /need administrator setup/);
});

test("product image guidance distinguishes sharp 4:5 assets, crop warnings and unusably small files", () => {
  assert.equal(assessProductImageDimensions(1200, 1500).level, "good");
  assert.equal(assessProductImageDimensions(1600, 900).label, "Check crop");
  assert.equal(assessProductImageDimensions(400, 500).level, "error");
});

// item 5: the final step is both an actionable readiness checklist AND the
// explicit two-option launch-policy decision — not just informational
// "here's what will happen" copy.
test("the final step is an actionable readiness checklist with an explicit launch-policy choice", () => {
  const source = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  assert.match(source, /required item/);
  assert.match(source, /Fix now/);
  assert.match(source, /How should this product launch\?/);
  assert.match(source, /Show now as Out of stock/);
  assert.match(source, /Publish when stock is ready/);
  assert.match(source, /effectiveLaunchPolicy/);
});

test("fulfillment guidance collapses into the editor header after the first step", () => {
  const formSource = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  const chromeSource = readFileSync(new URL("../components/admin/ProductEditorChrome.tsx", import.meta.url), "utf8");
  assert.match(formSource, /activeSection !== "basic"/);
  assert.match(chromeSource, /showFulfillmentBadge/);
  assert.match(chromeSource, /fulfillmentLabel/);
});

test("leaving with unsaved changes offers save, discard and keep-editing choices", () => {
  const formSource = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  const chromeSource = readFileSync(new URL("../components/admin/ProductEditorChrome.tsx", import.meta.url), "utf8");
  assert.match(formSource, /<UnsavedChangesDialog/);
  assert.match(formSource, /saveDraftAndLeave/);
  assert.match(formSource, /onLeave=\{\(\) => \{ clearLocalDraft\(\); router\.push\(cancelHref\); \}\}/);
  assert.match(chromeSource, /Save draft & leave/);
  assert.match(chromeSource, /Leave without saving/);
});

test("inventory and customer preview expose live variant-level insight", () => {
  const inventorySource = readFileSync(new URL("../components/admin/InventoryVariantsSection.tsx", import.meta.url), "utf8");
  const previewSource = readFileSync(new URL("../components/admin/ProductLivePreview.tsx", import.meta.url), "utf8");
  assert.match(inventorySource, /Variant summary/);
  assert.match(inventorySource, /sellable combinations/);
  assert.match(previewSource, /Variant preview/);
  assert.match(previewSource, /exact image, price and stock/);
});
