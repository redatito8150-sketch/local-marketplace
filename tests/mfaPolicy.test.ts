import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMfaChallengePath,
  decideMfaAccess,
  isMfaProtectedRequest,
} from "../lib/auth/mfaPolicy.ts";

test("opt-in MFA allows an aal1 session when the account has no verified factor", () => {
  assert.equal(
    decideMfaAccess({ currentLevel: "aal1", nextLevel: "aal1" }),
    "allow"
  );
});

test("opt-in MFA requires a challenge when an aal1 session can upgrade to aal2", () => {
  assert.equal(
    decideMfaAccess({ currentLevel: "aal1", nextLevel: "aal2" }),
    "mfa_required"
  );
});

test("an aal2 session remains allowed, including a stale token after factor removal", () => {
  assert.equal(
    decideMfaAccess({ currentLevel: "aal2", nextLevel: "aal2" }),
    "allow"
  );
  assert.equal(
    decideMfaAccess({ currentLevel: "aal2", nextLevel: "aal1" }),
    "allow"
  );
});

test("assurance lookup failures fail closed instead of silently accepting aal1", () => {
  assert.equal(decideMfaAccess(null), "assurance_unavailable");
  assert.equal(
    decideMfaAccess({ currentLevel: "aal1", nextLevel: "aal1" }, true),
    "assurance_unavailable"
  );
});

test("protected page matching excludes the account challenge page itself", () => {
  assert.equal(isMfaProtectedRequest("/account", "GET"), false);
  assert.equal(isMfaProtectedRequest("/account/overview", "GET"), true);
  assert.equal(isMfaProtectedRequest("/admin", "GET"), true);
  assert.equal(isMfaProtectedRequest("/administrator", "GET"), false);
  assert.equal(isMfaProtectedRequest("/brand-portal/orders", "GET"), true);
  assert.equal(isMfaProtectedRequest("/reset-password", "GET"), true);
});

test("private API reads and mutations are MFA protected while public coupon validation stays available", () => {
  assert.equal(isMfaProtectedRequest("/api/account/profile", "GET"), true);
  assert.equal(isMfaProtectedRequest("/api/admin/search", "GET"), true);
  assert.equal(isMfaProtectedRequest("/api/orders", "POST"), true);
  assert.equal(isMfaProtectedRequest("/api/reviews", "POST"), true);
  assert.equal(isMfaProtectedRequest("/api/reviews", "GET"), false);
  assert.equal(isMfaProtectedRequest("/api/coupons/validate", "POST"), false);
});

test("challenge paths preserve only an internal return destination", () => {
  assert.equal(
    buildMfaChallengePath("/admin/orders?status=paid"),
    "/account?mfa=required&next=%2Fadmin%2Forders%3Fstatus%3Dpaid"
  );
  assert.equal(buildMfaChallengePath("https://evil.example"), "/account?mfa=required");
  assert.equal(buildMfaChallengePath("//evil.example"), "/account?mfa=required");
});
