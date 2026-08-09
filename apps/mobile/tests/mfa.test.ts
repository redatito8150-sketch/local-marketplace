import assert from "node:assert/strict";
import test from "node:test";
import { resolveMfaGateStatus } from "../src/domain/mfa.ts";

test("an enrolled MFA user stays gated until the session reaches AAL2", () => {
  assert.equal(resolveMfaGateStatus("aal1", "aal2"), "required");
  assert.equal(resolveMfaGateStatus(null, "aal2"), "required");
});

test("AAL2 and users without an enrolled second factor pass the mobile gate", () => {
  assert.equal(resolveMfaGateStatus("aal2", "aal2"), "satisfied");
  assert.equal(resolveMfaGateStatus("aal1", "aal1"), "satisfied");
  assert.equal(resolveMfaGateStatus(null, null), "satisfied");
});

test("unknown future assurance levels fail closed", () => {
  assert.equal(resolveMfaGateStatus("aal3", "aal3"), "error");
  assert.equal(resolveMfaGateStatus("aal1", "aal3"), "error");
});
