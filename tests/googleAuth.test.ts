import assert from "node:assert/strict";
import test from "node:test";
import { getSafeRedirectPath } from "../lib/auth/safeRedirect.ts";
import { decidePostAuthDestination, getAccountEntryReturnPath } from "../lib/auth/postAuthDestination.ts";
import { parseGoogleAuthFlag } from "../lib/auth/googleAuthFlag.ts";

test("getSafeRedirectPath accepts a plain internal path", () => {
  assert.equal(getSafeRedirectPath("/account/wishlist"), "/account/wishlist");
});

test("getSafeRedirectPath accepts an internal path with query and hash", () => {
  assert.equal(getSafeRedirectPath("/shop/all?price=100-500#grid"), "/shop/all?price=100-500#grid");
});

test("getSafeRedirectPath rejects an absolute external URL", () => {
  assert.equal(getSafeRedirectPath("https://evil.com"), "/account/overview");
});

test("getSafeRedirectPath rejects a protocol-relative URL", () => {
  assert.equal(getSafeRedirectPath("//evil.com"), "/account/overview");
});

test("getSafeRedirectPath rejects a backslash variant browsers normalize to protocol-relative", () => {
  assert.equal(getSafeRedirectPath("/\\evil.com"), "/account/overview");
});

test("getSafeRedirectPath rejects a javascript: URL", () => {
  assert.equal(getSafeRedirectPath("javascript:alert(1)"), "/account/overview");
});

test("getSafeRedirectPath rejects a URL-encoded external redirect", () => {
  assert.equal(getSafeRedirectPath("%2F%2Fevil.com"), "/account/overview");
  assert.equal(getSafeRedirectPath(encodeURIComponent("https://evil.com")), "/account/overview");
});

test("getSafeRedirectPath rejects a malformed percent-encoded value", () => {
  assert.equal(getSafeRedirectPath("%E0%A4%A"), "/account/overview");
});

test("getSafeRedirectPath falls back for empty/missing input", () => {
  assert.equal(getSafeRedirectPath(null), "/account/overview");
  assert.equal(getSafeRedirectPath(undefined), "/account/overview");
  assert.equal(getSafeRedirectPath(""), "/account/overview");
});

test("getSafeRedirectPath honors a caller-supplied fallback", () => {
  assert.equal(getSafeRedirectPath("https://evil.com", "/cart"), "/cart");
  assert.equal(getSafeRedirectPath("", ""), "");
});

test("decidePostAuthDestination sends an onboarding-incomplete user to onboarding regardless of next", () => {
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: null, isAdmin: false, role: "customer" }, "/account/wishlist"), "/onboarding/add-address");
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: undefined, isAdmin: false, role: "customer" }, "https://evil.com"), "/onboarding/add-address");
});

test("decidePostAuthDestination sends an onboarding-complete user to a valid next path", () => {
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: "2026-01-01T00:00:00.000Z", isAdmin: false, role: "customer" }, "/account/wishlist"), "/account/wishlist");
});

test("decidePostAuthDestination falls back to the role workspace when next is absent or unsafe", () => {
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: "2026-01-01T00:00:00.000Z", isAdmin: false, role: "customer" }, null), "/account/overview");
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: "2026-01-01T00:00:00.000Z", isAdmin: false, role: "brand_owner" }, "https://evil.com"), "/brand-portal");
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: "2026-01-01T00:00:00.000Z", isAdmin: true, role: "admin" }, null), "/admin");
});

test("decidePostAuthDestination prevents cross-workspace redirect loops", () => {
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: "2026-01-01T00:00:00.000Z", isAdmin: false, role: "brand_owner" }, "/admin"), "/brand-portal");
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: "2026-01-01T00:00:00.000Z", isAdmin: false, role: "brand_assistant" }, "/admin/warehouse"), "/brand-portal");
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: "2026-01-01T00:00:00.000Z", isAdmin: false, role: "customer" }, "/brand-portal"), "/account/overview");
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: "2026-01-01T00:00:00.000Z", isAdmin: true, role: "admin" }, "/admin/warehouse"), "/admin/warehouse");
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: "2026-01-01T00:00:00.000Z", isAdmin: false, role: "brand_owner" }, "/brand-portal/warehouse"), "/brand-portal/warehouse");
});

test("direct account entry keeps every completed role in the personal account", () => {
  const accountEntry = getAccountEntryReturnPath(null);
  const completedAt = "2026-01-01T00:00:00.000Z";

  assert.equal(accountEntry, "/account/overview");
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: completedAt, isAdmin: true, role: "admin" }, accountEntry), "/account/overview");
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: completedAt, isAdmin: false, role: "brand_owner" }, accountEntry), "/account/overview");
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: completedAt, isAdmin: false, role: "brand_assistant" }, accountEntry), "/account/overview");
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: completedAt, isAdmin: false, role: "customer" }, accountEntry), "/account/overview");
});

test("account entry preserves safe protected destinations and rejects unsafe ones", () => {
  assert.equal(getAccountEntryReturnPath("/admin/warehouse"), "/admin/warehouse");
  assert.equal(getAccountEntryReturnPath("/account/wishlist"), "/account/wishlist");
  assert.equal(getAccountEntryReturnPath("https://evil.com"), "/account/overview");
  assert.equal(getAccountEntryReturnPath("//evil.com"), "/account/overview");
});

test("account entry still sends incomplete profiles through onboarding", () => {
  const accountEntry = getAccountEntryReturnPath(null);
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: null, isAdmin: true, role: "admin" }, accountEntry), "/onboarding/add-address");
  assert.equal(decidePostAuthDestination({ onboardingCompletedAt: null, isAdmin: false, role: "brand_owner" }, accountEntry), "/onboarding/add-address");
});

test("parseGoogleAuthFlag only accepts the exact string 'true'", () => {
  assert.equal(parseGoogleAuthFlag("true"), true);
  assert.equal(parseGoogleAuthFlag("false"), false);
  assert.equal(parseGoogleAuthFlag("TRUE"), false);
  assert.equal(parseGoogleAuthFlag("1"), false);
  assert.equal(parseGoogleAuthFlag(undefined), false);
});
