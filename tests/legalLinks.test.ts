import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PUBLIC_STATIC_ROUTES, DISALLOWED_ROUTES, SITE_URL } from "../lib/seo.ts";

// .tsx files contain JSX, which `node --test` can't import directly (only
// .ts type-stripping is supported, not JSX transforms — see
// tests/security.rls.test.ts and friends for this project's existing
// "no JSX-capable test runner" constraint). Footer/BrandFooter link
// correctness is verified here via source-text assertions instead of
// importing and rendering the components. app/sitemap.ts and app/robots.ts
// import via the "@/" path alias, which only resolves under Next's build,
// not this raw-node test runner — so this tests the same
// lib/seo.ts route lists those two route files render from, rather than
// importing the route files themselves.
const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function readSource(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("main Footer links Terms & conditions and Privacy Policy to real routes", () => {
  const source = readSource("components/Footer.tsx");
  assert.match(source, /"Terms & conditions":\s*"\/terms"/, "expected Terms & conditions -> /terms in the footer's href map");
  assert.match(source, /"Privacy Policy":\s*"\/privacy"/, "expected Privacy Policy -> /privacy in the footer's href map");
  assert.match(source, /"Privacy Policy"/, "expected a Privacy Policy label in the footer's link list");
});

test("BrandFooter links Terms & Conditions and Privacy Policy to real routes", () => {
  const source = readSource("components/brand/BrandFooter.tsx");
  assert.match(source, /"Terms & Conditions":\s*"\/terms"/, "expected Terms & Conditions -> /terms in BrandFooter's href map");
  assert.match(source, /"Privacy Policy":\s*"\/privacy"/, "expected Privacy Policy -> /privacy in BrandFooter's href map");
});

test("the sign-up consent checkbox links to /terms and /privacy", () => {
  const source = readSource("app/account/page.tsx");
  assert.match(source, /href="\/terms"/, "expected a working /terms link in the consent checkbox");
  assert.match(source, /href="\/privacy"/, "expected a working /privacy link in the consent checkbox");
});

test("no component references the old placeholder-only legal page copy", () => {
  const privacySource = readSource("app/privacy/page.tsx");
  const termsSource = readSource("app/terms/page.tsx");
  assert.doesNotMatch(privacySource, /being finalized/i);
  assert.doesNotMatch(termsSource, /being finalized/i);
});

test("sitemap includes /privacy and /terms, and SITE_URL resolves to an absolute origin", () => {
  assert.ok(PUBLIC_STATIC_ROUTES.includes("/privacy"), `expected /privacy in the sitemap route list`);
  assert.ok(PUBLIC_STATIC_ROUTES.includes("/terms"), `expected /terms in the sitemap route list`);
  assert.match(SITE_URL, /^https?:\/\//, `SITE_URL "${SITE_URL}" must be an absolute origin`);
});

test("robots does not block /privacy or /terms", () => {
  assert.ok(!DISALLOWED_ROUTES.includes("/privacy"), "/privacy must not be disallowed");
  assert.ok(!DISALLOWED_ROUTES.includes("/terms"), "/terms must not be disallowed");
});

test("main Footer contains no dead href=\"#\" links (literal or dynamic fallback)", () => {
  const source = readSource("components/Footer.tsx");
  assert.doesNotMatch(source, /href="#"/, "no literal href=\"#\" should remain");
  assert.doesNotMatch(source, /\?\?\s*"#"/, "no dynamic \"fall back to #\" pattern should remain");
  // A label with no real destination (e.g. "Contact us") must still be
  // present for the reader, just non-interactive rather than a dead link.
  assert.match(source, /"Contact us"/);
  assert.match(source, /aria-disabled="true"/, "unmapped labels must render as non-interactive text");
});

test("BrandFooter contains no dead href=\"#\" links (literal or dynamic fallback), including social icons", () => {
  const source = readSource("components/brand/BrandFooter.tsx");
  assert.doesNotMatch(source, /href="#"/, "no literal href=\"#\" should remain");
  assert.doesNotMatch(source, /\?\?\s*"#"/, "no dynamic \"fall back to #\" pattern should remain");
  assert.doesNotMatch(source, /<a\s+href="#"/);
  assert.match(source, /aria-disabled="true"/, "unmapped labels must render as non-interactive text");
});

test("no \"Cookie Policy\" link label is rendered in either footer", () => {
  const mainFooter = readSource("components/Footer.tsx");
  const brandFooter = readSource("components/brand/BrandFooter.tsx");
  assert.doesNotMatch(mainFooter, /Cookie Policy/);
  assert.doesNotMatch(brandFooter, /Cookie Policy/);
});
