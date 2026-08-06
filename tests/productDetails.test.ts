import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateProductSections, type ProductInput } from "../lib/admin/productValidation.ts";
import { buildProductPersistencePayload } from "../lib/admin/productPersistence.ts";
import {
  resolveShippingPolicy,
  MARKETPLACE_DEFAULT_POLICY_TEXT,
  MARKETPLACE_DEFAULT_RETURN_WINDOW_DAYS,
} from "../lib/admin/shippingPolicy.ts";
import { FASHION_FITS, isFitApplicable, recommendedFits } from "../lib/inventory/fitProfiles.ts";
import type { TaxonomyNode } from "../types/index.ts";

const validProduct: ProductInput = {
  name: "Linen Shirt",
  brandId: "brand-1",
  productTypeId: "type-shirts",
  audience: "unisex",
  price: 500,
  currency: "EGP",
  image: "https://images.unsplash.com/photo.jpg",
  images: [],
  description: "A complete product description.",
  details: ["Breathable fabric", "Relaxed shape"],
  careInstructions: ["Machine wash cold", "Do not bleach"],
  isNew: false,
  featured: false,
  status: "draft",
  defaultLowStockThreshold: 5,
  optionTypeIds: [],
  valueIdsByOptionType: {},
  variants: [{ optionValueIds: [], quantity: 1, sellingStatus: "active" }],
  colorImages: {},
};

// ── Description ─────────────────────────────────────────────────────────

test("Description: required validation fires with a clear message", () => {
  // status: "published" — Description is only required once a product is
  // actually going public (a Draft is intentionally allowed to skip it).
  const issues = validateProductSections({ ...validProduct, status: "published", description: "" });
  const issue = issues.find((i) => i.fieldId === "product-description");
  assert.ok(issue);
  assert.match(issue.message, /description/i);
});

test("Description: multi-paragraph text is preserved verbatim in the persistence payload", () => {
  const description = "First paragraph.\n\nSecond paragraph with a line break.";
  const payload = buildProductPersistencePayload({ ...validProduct, description });
  assert.equal(payload.description, description);
});

// ── Product Highlights (`details`) ──────────────────────────────────────

test("Product Highlights: order is preserved end to end into the persistence payload", () => {
  const details = ["First", "Second", "Third"];
  const payload = buildProductPersistencePayload({ ...validProduct, details });
  assert.deepEqual(payload.details, details);
});

test("Product Highlights: empty/whitespace-only rows are never required to be non-empty for Draft, and validation doesn't choke on them", () => {
  const issues = validateProductSections({ ...validProduct, details: ["Real highlight", ""] });
  // No dedicated highlight-required rule — this only proves empty rows
  // don't crash validation. Trimming/dropping empty rows is the editor's
  // job (HighlightsListBuilder), not validateProductSections'.
  assert.doesNotThrow(() => issues);
});

// ── Care Instructions ────────────────────────────────────────────────────

test("Care Instructions: stored as a structured array, not a joined string", () => {
  const careInstructions = ["Machine wash cold", "Do not bleach", "Line dry"];
  const payload = buildProductPersistencePayload({ ...validProduct, careInstructions });
  assert.deepEqual(payload.care_instructions, careInstructions);
});

test("the Product Editor uses the searchable Care Instructions catalog, not a free-text textarea", () => {
  const source = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Care Instructions \(one per line\)/);
  assert.match(source, /CareInstructionsPicker/);
});

// ── Shipping & Returns policy resolution ────────────────────────────────

test("Shipping & Returns: Brand policy takes priority over the marketplace default", () => {
  const resolved = resolveShippingPolicy({
    shippingPolicy: "Ships in 2-3 days.",
    returnPolicy: "14-day returns.",
    returnWindowDays: 14,
  });
  assert.equal(resolved.source, "brand");
  assert.match(resolved.text, /Ships in 2-3 days/);
  assert.match(resolved.text, /14-day returns/);
});

test("Shipping & Returns: marketplace default is used when the Brand has no policy", () => {
  const resolved = resolveShippingPolicy(null);
  assert.equal(resolved.source, "marketplace_default");
  assert.equal(resolved.text, MARKETPLACE_DEFAULT_POLICY_TEXT);
  assert.equal(resolved.returnWindowDays, MARKETPLACE_DEFAULT_RETURN_WINDOW_DAYS);
});

test("Shipping & Returns: default return window is exactly 7 days", () => {
  assert.equal(MARKETPLACE_DEFAULT_RETURN_WINDOW_DAYS, 7);
  assert.match(MARKETPLACE_DEFAULT_POLICY_TEXT, /7 days/);
});

test("Shipping & Returns: a Brand with only a return window (no free text) still resolves to a Brand-sourced policy", () => {
  const resolved = resolveShippingPolicy({ returnWindowDays: 30 });
  assert.equal(resolved.source, "brand");
  assert.equal(resolved.returnWindowDays, 30);
  assert.match(resolved.text, /30 days/);
});

test("Product Editor never sends per-product Shipping & Returns text anymore — it's resolved, not edited", () => {
  const source = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /set\("shippingReturns"/);
  assert.match(source, /resolveShippingPolicy/);
});

// ── Materials ────────────────────────────────────────────────────────────

test("Materials: multiple materials are stored as structured {material, percentage} entries", () => {
  const materials = [{ material: "Cotton", percentage: 80 }, { material: "Polyester", percentage: 20 }];
  const payload = buildProductPersistencePayload({ ...validProduct, materials });
  assert.deepEqual(payload.materials, materials);
});

test("Materials: Draft allows an incomplete (non-100%) total", () => {
  const issues = validateProductSections({
    ...validProduct,
    status: "draft",
    materials: [{ material: "Cotton", percentage: 40 }],
  });
  assert.ok(!issues.some((i) => i.fieldId === "product-materials"));
});

test("Materials: Publish blocks a total that isn't exactly 100%", () => {
  const issues = validateProductSections({
    ...validProduct,
    status: "published",
    materials: [{ material: "Cotton", percentage: 40 }, { material: "Polyester", percentage: 40 }],
  });
  const issue = issues.find((i) => i.fieldId === "product-materials");
  assert.ok(issue);
  assert.match(issue.message, /100%/);
});

test("Materials: Publish accepts a total of exactly 100%", () => {
  const issues = validateProductSections({
    ...validProduct,
    status: "published",
    materials: [{ material: "Cotton", percentage: 80 }, { material: "Polyester", percentage: 20 }],
  });
  assert.ok(!issues.some((i) => i.fieldId === "product-materials"));
});

test("Materials: no materials at all is valid (Materials is optional, not mandatory)", () => {
  const issues = validateProductSections({ ...validProduct, status: "published", materials: [] });
  assert.ok(!issues.some((i) => i.fieldId === "product-materials"));
});

test("Materials: each percentage must be between 0 and 100", () => {
  const issues = validateProductSections({
    ...validProduct,
    status: "published",
    materials: [{ material: "Cotton", percentage: 150 }],
  });
  assert.ok(issues.some((i) => i.fieldId === "product-materials" && /between 0 and 100/.test(i.message)));
});

test("the Product Editor lets multiple Materials be composed, not a single Material dropdown", () => {
  const source = readFileSync(new URL("../components/admin/ProductForm.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Select material/);
  assert.match(source, /MaterialsComposer/);
});

// ── Fit ──────────────────────────────────────────────────────────────────

const fitNodes: TaxonomyNode[] = [
  { id: "main-clothing", parentId: null, level: 1, name: "Clothing", slug: "clothing", sortOrder: 0, isActive: true },
  { id: "group-bottoms", parentId: "main-clothing", level: 2, name: "Bottoms", slug: "bottoms", sortOrder: 0, isActive: true },
  { id: "type-trousers", parentId: "group-bottoms", level: 3, name: "Trousers", slug: "trousers", sortOrder: 0, isActive: true },
  { id: "main-jewelry", parentId: null, level: 1, name: "Jewelry", slug: "jewelry", sortOrder: 1, isActive: true },
  { id: "group-rings", parentId: "main-jewelry", level: 2, name: "Rings", slug: "rings", sortOrder: 0, isActive: true },
  { id: "type-rings", parentId: "group-rings", level: 3, name: "Rings", slug: "rings-leaf", sortOrder: 0, isActive: true },
];

test("Fit: recommends Product-Type-specific fits (trousers) ahead of the generic Fashion list", () => {
  const recommended = recommendedFits(fitNodes, "type-trousers");
  assert.ok(recommended.includes("Slim Fit"));
  assert.ok(recommended.includes("Wide Leg"));
  assert.notEqual(recommended.join(","), FASHION_FITS.join(","));
});

test("Fit: falls back to the full Fashion list for an unrecognized Product Type", () => {
  const recommended = recommendedFits(fitNodes, "type-unknown");
  assert.deepEqual(recommended, [...FASHION_FITS]);
});

test("Fit: falls back to the full Fashion list when no Product Type is selected yet", () => {
  assert.deepEqual(recommendedFits(fitNodes, ""), [...FASHION_FITS]);
});

test("Fit: is not applicable for Jewelry Product Types", () => {
  assert.equal(isFitApplicable(fitNodes, "type-rings"), false);
});

test("Fit: is applicable for ordinary apparel Product Types", () => {
  assert.equal(isFitApplicable(fitNodes, "type-trousers"), true);
});

test("the Product Editor hides Fit entirely (not just disables it) when not applicable", () => {
  const source = readFileSync(new URL("../components/admin/FitSelect.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!isFitApplicable\(taxonomyNodes, productTypeId\)\) return null;/);
});

test("Fit: an already-selected value that's no longer recommended is preserved with a warning, not cleared", () => {
  const source = readFileSync(new URL("../components/admin/FitSelect.tsx", import.meta.url), "utf8");
  assert.match(source, /currentNotRecommended/);
  assert.doesNotMatch(source, /onChange\(""\)/);
});

// ── Compatibility / migration ───────────────────────────────────────────

test("compatibility: the legacy single `material` and `shippingReturns` fields are never overwritten when omitted", () => {
  const { material, shippingReturns, ...rest } = validProduct as ProductInput & { material?: string; shippingReturns?: string };
  const payload = buildProductPersistencePayload(rest as ProductInput);
  assert.equal("material" in payload, false);
  assert.equal("shipping_returns" in payload, false);
});

test("compatibility: an explicitly provided legacy material/shippingReturns value is still written through (revert/legacy callers)", () => {
  const payload = buildProductPersistencePayload({ ...validProduct, material: "Cotton", shippingReturns: "Legacy text" });
  assert.equal(payload.material, "Cotton");
  assert.equal(payload.shipping_returns, "Legacy text");
});

test("the migration backfills existing single-material products into materials[] at exactly 100%, without deleting the legacy column", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260803000003_product_details_rebuild.sql", import.meta.url), "utf8");
  assert.match(sql, /materials jsonb not null default '\[\]'/);
  assert.match(sql, /jsonb_build_object\('material', material, 'percentage', 100\)/);
  assert.doesNotMatch(sql, /drop column/i);
});
