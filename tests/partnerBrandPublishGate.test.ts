import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Static verification that every product create/edit route sets
// isPartnerBrand server-side from the real brand row (never trusting
// whatever the client sent), the same "never trust the client" pattern
// already used for brandId and forceZeroOpeningStock in these same
// routes. The actual validation-rule behavior (the partner-brand publish
// exception) is exercised with real function calls in
// tests/productEditorExperience.test.ts.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("brand-portal create route sets isPartnerBrand from owner.isMahalyPartner before validating", () => {
  const route = read("app/api/brand-portal/products/route.ts");
  const setIndex = route.indexOf("body.isPartnerBrand = owner.isMahalyPartner");
  const validateIndex = route.indexOf("validateProductInput(body)");
  assert.ok(setIndex !== -1, "expected body.isPartnerBrand to be set from owner.isMahalyPartner");
  assert.ok(validateIndex !== -1);
  assert.ok(setIndex < validateIndex, "isPartnerBrand must be set before validation runs");
});

test("brand-portal edit route sets isPartnerBrand from owner.isMahalyPartner before validating", () => {
  const route = read("app/api/brand-portal/products/[id]/route.ts");
  const setIndex = route.indexOf("productBody.isPartnerBrand = owner.isMahalyPartner");
  const validateIndex = route.indexOf("validateProductInput(productBody)");
  assert.ok(setIndex !== -1, "expected productBody.isPartnerBrand to be set from owner.isMahalyPartner");
  assert.ok(validateIndex !== -1);
  assert.ok(setIndex < validateIndex, "isPartnerBrand must be set before validation runs");
});

test("admin create route sets isPartnerBrand from the real brands.is_mahaly_partner row (not the client) before validating", () => {
  const route = read("app/api/admin/products/route.ts");
  const setIndex = route.indexOf("body.isPartnerBrand = Boolean(brandRow.is_mahaly_partner)");
  const validateIndex = route.indexOf("validateProductInput(body)");
  assert.ok(setIndex !== -1, "expected body.isPartnerBrand to be set from the fetched brand row");
  assert.ok(validateIndex !== -1);
  assert.ok(setIndex < validateIndex, "isPartnerBrand must be set before validation runs");
});

test("admin edit route sets isPartnerBrand from the real brands.is_mahaly_partner row (not the client) before validating", () => {
  const route = read("app/api/admin/products/[id]/route.ts");
  const setIndex = route.indexOf("body.isPartnerBrand = Boolean(brandRow?.is_mahaly_partner)");
  const validateIndex = route.indexOf("validateProductInput(body)");
  assert.ok(setIndex !== -1, "expected body.isPartnerBrand to be set from the fetched brand row");
  assert.ok(validateIndex !== -1);
  assert.ok(setIndex < validateIndex, "isPartnerBrand must be set before validation runs");
});

test("ProductForm's client-side completeness check passes the same isPartnerBrand signal used for the Opening Stock lock, so the 'Complete' badge doesn't show a permanently-unresolvable issue for a partner brand", () => {
  const form = read("components/admin/ProductForm.tsx");
  assert.match(form, /isPartnerBrand,\s*\n\s*\}\);/);
});
