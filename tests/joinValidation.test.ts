import test from "node:test";
import assert from "node:assert/strict";
import {
  draftApplicationSchema,
  submitApplicationSchema,
} from "../lib/join/validation.ts";
import {
  computeReapplicationAllowedAt,
  isValidStatusTransition,
  isWithinReapplicationCooldown,
  REAPPLICATION_COOLDOWN_DAYS,
} from "../lib/join/constants.ts";
import type { BrandApplicationRecord } from "../types/index.ts";

const validSubmission = {
  founderName: "Sara Ahmed",
  email: "sara@example.com",
  phone: "+201001234567",
  applicantRole: "founder",
  brandName: "Sara Studio",
  otherSocialUrls: [],
  additionalCategories: [],
  productCategory: "Women's Fashion",
  brandStory: "A small studio making handmade accessories.",
  country: "Egypt",
  city: "Cairo",
  salesChannelsList: ["Instagram"],
  legalStatus: "unregistered_individual",
  productsManufacturedByBrand: true,
  madeToOrder: true,
  returnExchangeAvailable: true,
  consentAccurate: true,
  consentTerms: true,
};

test("submitApplicationSchema accepts a fully valid submission", () => {
  const result = submitApplicationSchema.safeParse(validSubmission);
  assert.equal(result.success, true);
});

test("submitApplicationSchema requires consent checkboxes to be true", () => {
  const result = submitApplicationSchema.safeParse({
    ...validSubmission,
    consentAccurate: false,
  });
  assert.equal(result.success, false);
});

test("submitApplicationSchema requires a commercial registration number when legal status needs one", () => {
  const result = submitApplicationSchema.safeParse({
    ...validSubmission,
    legalStatus: "commercial_registration_only",
    commercialRegistrationNumber: undefined,
  });
  assert.equal(result.success, false);

  const withNumber = submitApplicationSchema.safeParse({
    ...validSubmission,
    legalStatus: "commercial_registration_only",
    commercialRegistrationNumber: "12345",
  });
  assert.equal(withNumber.success, true);
});

test("submitApplicationSchema requires at least one sales channel", () => {
  const result = submitApplicationSchema.safeParse({
    ...validSubmission,
    salesChannelsList: [],
  });
  assert.equal(result.success, false);
});

test("draftApplicationSchema accepts a partially filled-in draft", () => {
  const result = draftApplicationSchema.safeParse({ brandName: "Just Started" });
  assert.equal(result.success, true);
});

test("draftApplicationSchema accepts an empty draft", () => {
  const result = draftApplicationSchema.safeParse({});
  assert.equal(result.success, true);
});

test("isValidStatusTransition rejects invalid jumps and allows valid ones", () => {
  assert.equal(isValidStatusTransition("draft", "approved"), false);
  assert.equal(isValidStatusTransition("draft", "submitted"), true);
  assert.equal(isValidStatusTransition("submitted", "under_review"), true);
  assert.equal(isValidStatusTransition("under_review", "changes_requested"), true);
  assert.equal(isValidStatusTransition("rejected", "submitted"), false);
  assert.equal(isValidStatusTransition("approved", "converted_to_brand"), true);
});

function makeRejectedApp(overrides: Partial<BrandApplicationRecord> = {}): BrandApplicationRecord {
  return {
    ...validSubmission,
    id: "app-1",
    status: "rejected",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    applicantUserId: "user-1",
    reapplicationOverride: false,
    applicantAccountSnapshot: null,
    otherSocialUrls: [],
    additionalCategories: [],
    salesChannelsList: ["Instagram"],
    ...overrides,
  } as BrandApplicationRecord;
}

test("isWithinReapplicationCooldown blocks reapplying until the cooldown date passes", () => {
  const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  assert.equal(isWithinReapplicationCooldown(makeRejectedApp({ reapplicationAllowedAt: future })), true);
  assert.equal(isWithinReapplicationCooldown(makeRejectedApp({ reapplicationAllowedAt: past })), false);
  assert.equal(
    isWithinReapplicationCooldown(makeRejectedApp({ reapplicationAllowedAt: future, reapplicationOverride: true })),
    false
  );
  assert.equal(
    isWithinReapplicationCooldown({ ...makeRejectedApp({ reapplicationAllowedAt: future }), status: "withdrawn" }),
    false
  );
});

test("computeReapplicationAllowedAt adds the configured cooldown window", () => {
  const from = new Date("2026-01-01T00:00:00.000Z");
  const result = new Date(computeReapplicationAllowedAt(from));
  const expectedDays = Math.round((result.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  assert.equal(expectedDays, REAPPLICATION_COOLDOWN_DAYS);
});
