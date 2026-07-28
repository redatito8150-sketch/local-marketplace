import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  brandApplicationDataSchema,
  brandApplicationDraftPayloadSchema,
  brandApplicationSubmitPayloadSchema,
  structuredErrors,
} from "../lib/join/rebuildValidation.ts";
import {
  APPLICATION_ONLY_FIELDS,
  BRAND_PROFILE_SEED_FIELDS,
  PRIVATE_ONBOARDING_DEFAULT_FIELDS,
} from "../lib/join/brandTransferContract.ts";

const validData = {
  fullName: "Sara Mohamed",
  businessEmail: "sara@brand.test",
  phone: "+201001234567",
  applicantRole: "founder",
  preferredContactMethod: "email",
  brandName: "Sara Studio",
  brandNameAr: "",
  primaryCategory: "Accessories",
  targetAudiences: ["Women"],
  country: "Egypt",
  city: "Cairo",
  foundedYear: 2024,
  shortDescription: "Locally made accessories with a quiet Egyptian point of view.",
  fullBrandStory: "A Cairo studio creating thoughtful accessories in small batches.",
  brandDifference: "Original local design and transparent production.",
  salesChannels: ["Instagram"],
  socialLinks: { Instagram: { url: "https://instagram.com/sarastudio" } },
  productCountRange: "21_50",
  monthlyOrdersRange: "21_50",
  teamSizeRange: "2_5",
  monthlySalesRange: "prefer_not",
  businessType: "registered_company",
  legalBusinessName: "Sara Studio LLC",
  commercialRegistrationNumber: "CR-123",
  taxRegistrationNumber: "",
  registrationCountry: "Egypt",
  operatingName: "",
  registrationExpectedDate: "",
  productCategories: ["Accessories"],
  typicalMinimumPrice: 250,
  typicalMaximumPrice: 1500,
  variantReadiness: "color",
  manufacturingModel: "local_workshop",
  manufacturingCountry: "Egypt",
  productionLeadTime: "7 days",
  inventoryModels: ["in_stock", "limited_drops"],
  inventoryStorage: "brand_studio",
  orderPreparation: "brand_team",
  courierPickup: "yes",
  preparationTime: "2_3_days",
  shippingCoverage: ["nationwide"],
  shippingProvider: "",
  returnsAccepted: true,
  exchangesAccepted: true,
  returnWindow: "14 days",
  nonReturnableCategories: "",
  agreementAccurate: true,
  agreementAuthorized: true,
  agreementReview: true,
} as const;

test("rebuilt application accepts a complete five-step submission", () => {
  assert.equal(brandApplicationDataSchema.safeParse(validData).success, true);
  assert.equal(
    brandApplicationSubmitPayloadSchema.safeParse({
      applicationData: validData,
      currentStep: 5,
      lockVersion: 3,
    }).success,
    true
  );
});
test("drafts remain partial while final submission is server-authoritatively complete", () => {
  assert.equal(
    brandApplicationDraftPayloadSchema.safeParse({
      applicationData: { brandName: "Started" },
      currentStep: 2,
    }).success,
    true
  );
  assert.equal(brandApplicationDataSchema.safeParse({ brandName: "Started" }).success, false);
});

test("draft autosave accepts the initialized empty UI state", () => {
  const parsed = brandApplicationDraftPayloadSchema.safeParse({
    applicationData: {
      fullName: "Reda Gad",
      businessEmail: "redatito8150@gmail.com",
      phone: "01124605939",
      applicantRole: "founder",
      preferredContactMethod: "email",
      country: "Egypt",
      city: "Cairo",
      targetAudiences: [],
      salesChannels: [],
      socialLinks: {},
      productCategories: [],
      inventoryModels: [],
      shippingCoverage: [],
      returnsAccepted: true,
      exchangesAccepted: true,
      agreementAccurate: false,
      agreementAuthorized: false,
      agreementReview: false,
    },
    currentStep: 1,
  });

  assert.equal(parsed.success, true);
});

test("structured errors identify step, section, field, and blocking status", () => {
  const parsed = brandApplicationDataSchema.safeParse({ ...validData, businessEmail: "bad" });
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  const error = structuredErrors(parsed.error).find((item) => item.field === "businessEmail");
  assert.deepEqual(error, {
    step: 1,
    section: "contact",
    field: "businessEmail",
    message: "Enter a valid business email",
    blocking: true,
  });
});

test("legal/contact/review fields never appear in the public brand seed contract", () => {
  for (const field of ["businessEmail", "phone", "commercialRegistrationNumber", "taxRegistrationNumber", "internalReview"]) {
    assert.ok(APPLICATION_ONLY_FIELDS.includes(field as never));
    assert.ok(!BRAND_PROFILE_SEED_FIELDS.includes(field as never));
    assert.ok(!PRIVATE_ONBOARDING_DEFAULT_FIELDS.includes(field as never));
  }
});

test("conversion migration is idempotent, owner-linked, draft-only, and preserves the application", () => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const sql = readFileSync(
    path.join(root, "supabase/migrations/20260730000010_rebuild_brand_application_contract.sql"),
    "utf8"
  );
  assert.match(sql, /if v_application\.converted_brand_id is not null/i);
  assert.match(sql, /return v_slug/i);
  assert.match(sql, /owner_user_id, source_application_id, setup_status/i);
  assert.match(sql, /'setup_required'/i);
  assert.match(sql, /is_active[\s\S]*false/i);
  assert.match(sql, /insert into public\.brand_staff/i);
  assert.doesNotMatch(sql, /delete from public\.brand_applications/i);
});
