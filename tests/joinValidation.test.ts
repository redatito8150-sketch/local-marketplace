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

const currentYear = new Date().getFullYear();

const validSubmission = {
  founderName: "Sara Ahmed",
  email: "sara@example.com",
  phone: "+201001234567",
  applicantRole: "founder",
  brandNameAr: "استوديو سارة",
  brandNameEn: "Sara Studio",
  productCategory: "Women's Fashion",
  brandStory: "A small studio making handmade accessories.",
  foundingYear: currentYear - 2,
  country: "Egypt",
  city: "Cairo",
  salesChannelsList: ["Instagram"],
  salesChannelLinks: { Instagram: "https://instagram.com/sarastudio" },
  approxProductCountRange: "0_20",
  approxMonthlyOrdersRange: "20_100",
  legalStatus: "unregistered_individual",
  priceMin: 100,
  priceMax: 500,
  manufacturingModel: "own_production",
  fulfillmentModel: "ready_to_ship",
  avgPreparationTimeRange: "1_2_days",
  shippingCoverageOption: "all_egypt",
  returnsPolicy: "returns_and_exchanges",
  inventoryModel: ["in_stock"],
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

test("submitApplicationSchema requires specifying a role when applicantRole is 'other'", () => {
  const result = submitApplicationSchema.safeParse({
    ...validSubmission,
    applicantRole: "other",
    applicantRoleOther: undefined,
  });
  assert.equal(result.success, false);

  const withRole = submitApplicationSchema.safeParse({
    ...validSubmission,
    applicantRole: "other",
    applicantRoleOther: "Marketing consultant",
  });
  assert.equal(withRole.success, true);
});

test("submitApplicationSchema rejects a city outside the 27 Egyptian governorates", () => {
  const result = submitApplicationSchema.safeParse({ ...validSubmission, city: "Not A Real City" });
  assert.equal(result.success, false);
});

test("submitApplicationSchema rejects a category outside the fixed list", () => {
  const result = submitApplicationSchema.safeParse({ ...validSubmission, productCategory: "Electronics" });
  assert.equal(result.success, false);
});

test("submitApplicationSchema requires approx. product count and monthly orders ranges", () => {
  const missingCount = submitApplicationSchema.safeParse({
    ...validSubmission,
    approxProductCountRange: undefined,
  });
  assert.equal(missingCount.success, false);

  const invalidRange = submitApplicationSchema.safeParse({
    ...validSubmission,
    approxMonthlyOrdersRange: "not_a_real_bucket",
  });
  assert.equal(invalidRange.success, false);
});

test("submitApplicationSchema validates strict-URL sales channel links but not free-text ones", () => {
  const badInstagram = submitApplicationSchema.safeParse({
    ...validSubmission,
    salesChannelsList: ["Instagram"],
    salesChannelLinks: { Instagram: "not-a-url" },
  });
  assert.equal(badInstagram.success, false);

  const popupMarketsFreeText = submitApplicationSchema.safeParse({
    ...validSubmission,
    salesChannelsList: ["Instagram", "Pop-up markets"],
    salesChannelLinks: {
      Instagram: "https://instagram.com/sarastudio",
      "Pop-up markets": "Weekend market at Zamalek, no link",
    },
  });
  assert.equal(popupMarketsFreeText.success, true);
});

test("submitApplicationSchema requires the maximum price to be at least the minimum price", () => {
  const result = submitApplicationSchema.safeParse({
    ...validSubmission,
    priceMin: 500,
    priceMax: 100,
  });
  assert.equal(result.success, false);

  const equalOk = submitApplicationSchema.safeParse({
    ...validSubmission,
    priceMin: 500,
    priceMax: 500,
  });
  assert.equal(equalOk.success, true);
});

test("submitApplicationSchema requires at least one governorate when shipping coverage is 'selected_governorates'", () => {
  const missing = submitApplicationSchema.safeParse({
    ...validSubmission,
    shippingCoverageOption: "selected_governorates",
    shippingGovernorates: [],
  });
  assert.equal(missing.success, false);

  const withGovernorate = submitApplicationSchema.safeParse({
    ...validSubmission,
    shippingCoverageOption: "selected_governorates",
    shippingGovernorates: ["Cairo", "Giza"],
  });
  assert.equal(withGovernorate.success, true);
});

test("submitApplicationSchema rejects an inventory model value outside the fixed set", () => {
  const result = submitApplicationSchema.safeParse({
    ...validSubmission,
    inventoryModel: ["not_a_real_value"],
  });
  assert.equal(result.success, false);
});

test("draftApplicationSchema accepts a partially filled-in draft", () => {
  const result = draftApplicationSchema.safeParse({ brandNameEn: "Just Started" });
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
    brandName: validSubmission.brandNameEn,
    instagramOrWebsite: "",
    status: "rejected",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    applicantUserId: "user-1",
    reapplicationOverride: false,
    applicantAccountSnapshot: null,
    otherSocialUrls: [],
    additionalCategories: [],
    salesChannelsList: ["Instagram"],
    salesChannelLinks: validSubmission.salesChannelLinks,
    shippingGovernorates: [],
    inventoryModel: validSubmission.inventoryModel,
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
