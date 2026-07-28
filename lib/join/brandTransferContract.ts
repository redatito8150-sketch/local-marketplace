/**
 * Explicit application -> brand conversion contract.
 *
 * The database function is authoritative and mirrors this list. Keeping the
 * contract here makes admin/onboarding code reviewable without ever treating
 * the full application payload as a public brand payload.
 */
export const BRAND_PROFILE_SEED_FIELDS = [
  "brandName",
  "brandNameAr",
  "primaryCategory",
  "targetAudiences",
  "country",
  "city",
  "foundedYear",
  "shortDescription",
  "fullBrandStory",
  "socialLinks.Website",
] as const;
export const APPLICATION_ONLY_FIELDS = [
  "fullName",
  "businessEmail",
  "phone",
  "applicantRole",
  "preferredContactMethod",
  "businessType",
  "legalBusinessName",
  "commercialRegistrationNumber",
  "taxRegistrationNumber",
  "documents",
  "productCountRange",
  "monthlyOrdersRange",
  "monthlySalesRange",
  "teamSizeRange",
  "internalReview",
  "rejectionReason",
  "informationRequests",
] as const;

export const PRIVATE_ONBOARDING_DEFAULT_FIELDS = [
  "manufacturingModel",
  "inventoryModels",
  "inventoryStorage",
  "orderPreparation",
  "courierPickup",
  "preparationTime",
  "shippingCoverage",
  "returnsAccepted",
  "exchangesAccepted",
  "returnWindow",
] as const;
