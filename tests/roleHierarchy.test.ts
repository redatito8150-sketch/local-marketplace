import test from "node:test";
import assert from "node:assert/strict";
import { canActorManage, deriveProfileTier, LEGACY_TIER_RANK } from "../lib/roleHierarchy.ts";

test("canActorManage: only strictly-below ranks are manageable", () => {
  assert.equal(canActorManage(100, 50), true, "Admin (100) can manage Manager (50)");
  assert.equal(canActorManage(100, 10), true, "Admin (100) can manage Staff (10)");
  assert.equal(canActorManage(50, 10), true, "Manager (50) can manage Staff (10)");
  assert.equal(canActorManage(10, 10), false, "same rank can never manage same rank");
  assert.equal(canActorManage(10, 50), false, "a lower rank can never manage a higher rank");
  assert.equal(canActorManage(0, 0), false, "no roles held, no roles manageable");
});

test("LEGACY_TIER_RANK matches the protected roles' seeded ranks (admin=100/manager=50/staff=10)", () => {
  assert.deepEqual(LEGACY_TIER_RANK, { admin: 100, manager: 50, staff: 10 });
});

test("deriveProfileTier: holding a role at admin rank always resolves to the admin tier", () => {
  assert.deepEqual(deriveProfileTier(100, null), { isAdmin: true, role: "admin" });
  assert.deepEqual(deriveProfileTier(150, null), { isAdmin: true, role: "admin" }, "any rank >= 100 is still admin-tier");
});

test("deriveProfileTier: manager-rank and staff-rank bands", () => {
  assert.deepEqual(deriveProfileTier(50, null), { isAdmin: true, role: "manager" });
  assert.deepEqual(deriveProfileTier(99, null), { isAdmin: true, role: "manager" }, "just under admin still manager");
  assert.deepEqual(deriveProfileTier(10, null), { isAdmin: true, role: "staff" });
  assert.deepEqual(deriveProfileTier(1, null), { isAdmin: true, role: "staff" }, "any custom role above 0 is at least staff-tier");
});

test("deriveProfileTier: zero roles held always drops to plain customer — no partial step-down", () => {
  assert.deepEqual(deriveProfileTier(0, null), { isAdmin: false, role: "customer" });
});

test("deriveProfileTier: zero roles held, but the account is a real brand owner/assistant — that link is preserved, not clobbered", () => {
  assert.deepEqual(deriveProfileTier(0, "owner"), { isAdmin: false, role: "brand_owner" });
  assert.deepEqual(deriveProfileTier(0, "assistant"), { isAdmin: false, role: "brand_assistant" });
});

test("deriveProfileTier: holding a role always wins over any brand link (internal-team access takes priority for the tier value)", () => {
  assert.deepEqual(deriveProfileTier(10, "owner"), { isAdmin: true, role: "staff" });
});
