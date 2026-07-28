import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const required = (label: string, max: number) => text(max).min(1, `${label} is required`);
const optional = (max: number) => text(max).optional().or(z.literal(""));
const url = z.string().trim().url("Enter a valid URL").optional().or(z.literal(""));

export const APPLICATION_CATEGORIES = [
  "Clothing",
  "Shoes",
  "Bags",
  "Accessories",
  "Jewelry",
  "Kids & Baby",
  "Other",
] as const;

export const TARGET_AUDIENCES = ["Men", "Women", "Unisex", "Kids & Baby"] as const;
export const SALES_CHANNELS = [
  "Instagram",
  "Facebook",
  "TikTok",
  "Website",
  "Physical Store",
  "Pop-up Markets",
  "Other Marketplaces",
] as const;

const socialLinkSchema = z.object({
  handle: optional(120),
  url,
  marketplaceName: optional(120),
});

export const brandApplicationDataObjectSchema = z.object({
  fullName: required("Full name", 120),
  businessEmail: required("Business email", 254).email("Enter a valid business email"),
  phone: required("Phone number", 40),
  applicantRole: z.enum([
    "founder",
    "co_founder",
    "owner",
    "brand_manager",
    "operations_manager",
    "authorized_representative",
    "other",
  ]),
  applicantRoleOther: optional(120),
  preferredContactMethod: z.enum(["email", "phone", "whatsapp"]),

  brandName: required("Brand name", 120),
  brandNameAr: optional(120),
  primaryCategory: z.enum(APPLICATION_CATEGORIES),
  targetAudiences: z.array(z.enum(TARGET_AUDIENCES)).min(1, "Choose at least one audience"),
  country: required("Country", 80),
  city: required("City", 80),
  foundedYear: z.number().int().min(1900).max(new Date().getFullYear()),
  shortDescription: required("Short brand description", 160),
  fullBrandStory: required("Full brand story", 1500),
  brandDifference: required("What makes your brand different", 800),
  salesChannels: z.array(z.enum(SALES_CHANNELS)).min(1, "Choose at least one sales channel"),
  socialLinks: z.record(socialLinkSchema).default({}),
  productCountRange: z.enum(["1_20", "21_50", "51_100", "101_250", "251_500", "500_plus"]),
  monthlyOrdersRange: z.enum(["not_selling", "1_20", "21_50", "51_100", "101_250", "251_500", "500_plus"]),
  teamSizeRange: z.enum(["1", "2_5", "6_10", "11_25", "25_plus"]),
  monthlySalesRange: optional(80),

  businessType: z.enum([
    "registered_company",
    "registered_sole_proprietorship",
    "unregistered_individual",
    "registration_in_progress",
    "other",
  ]),
  legalBusinessName: optional(160),
  commercialRegistrationNumber: optional(80),
  taxRegistrationNumber: optional(80),
  registrationCountry: optional(80),
  operatingName: optional(160),
  registrationExpectedDate: optional(30),

  productCategories: z.array(z.enum(APPLICATION_CATEGORIES)).min(1, "Choose at least one product category"),
  typicalMinimumPrice: z.number().min(0),
  typicalMaximumPrice: z.number().min(0),
  variantReadiness: z.enum(["none", "size", "color", "size_and_color", "other"]),
  manufacturingModel: z.enum([
    "in_house",
    "local_workshop",
    "third_party",
    "imported_finished",
    "mixed",
    "made_to_order",
  ]),
  manufacturingCountry: optional(80),
  productionLeadTime: optional(80),
  inventoryModels: z.array(z.enum(["in_stock", "made_to_order", "pre_order", "limited_drops", "seasonal", "consignment"])).min(1),
  inventoryStorage: z.enum(["brand_studio", "warehouse", "physical_store", "third_party", "multiple", "other"]),
  orderPreparation: z.enum(["brand_team", "warehouse_team", "third_party", "other"]),
  courierPickup: z.enum(["yes", "no", "sometimes"]),
  preparationTime: z.enum(["same_day", "1_day", "2_3_days", "4_7_days", "more_7_days", "varies"]),
  shippingCoverage: z.array(z.enum(["cairo_giza", "alexandria", "major_cities", "nationwide", "selected_areas", "international"])).min(1),
  shippingProvider: optional(120),
  returnsAccepted: z.boolean(),
  exchangesAccepted: z.boolean(),
  returnWindow: required("Return window", 80),
  nonReturnableCategories: optional(300),

  agreementAccurate: z.literal(true, { errorMap: () => ({ message: "Confirm that the information is accurate" }) }),
  agreementAuthorized: z.literal(true, { errorMap: () => ({ message: "Confirm that you are authorized" }) }),
  agreementReview: z.literal(true, { errorMap: () => ({ message: "Accept the review process and privacy policy" }) }),
});

export const brandApplicationDataSchema = brandApplicationDataObjectSchema
  .refine((value) => value.applicantRole !== "other" || Boolean(value.applicantRoleOther), {
    path: ["applicantRoleOther"],
    message: "Please specify your role",
  })
  .refine((value) => value.typicalMaximumPrice >= value.typicalMinimumPrice, {
    path: ["typicalMaximumPrice"],
    message: "Maximum price must be greater than or equal to minimum price",
  })
  .refine(
    (value) =>
      !["registered_company", "registered_sole_proprietorship"].includes(value.businessType) ||
      Boolean(value.legalBusinessName && value.commercialRegistrationNumber && value.registrationCountry),
    { path: ["legalBusinessName"], message: "Registered businesses must provide their legal registration details" }
  );

// Drafts intentionally accept incomplete values. Autosave includes initialized
// empty arrays and unchecked agreements, which must remain valid until submit.
export const brandApplicationDraftDataSchema = brandApplicationDataObjectSchema.partial().extend({
  fullName: text(120).optional(),
  businessEmail: text(254).optional(),
  phone: text(40).optional(),
  brandName: text(120).optional(),
  country: text(80).optional(),
  city: text(80).optional(),
  shortDescription: text(160).optional(),
  fullBrandStory: text(1500).optional(),
  brandDifference: text(800).optional(),
  returnWindow: text(80).optional(),
  targetAudiences: z.array(z.enum(TARGET_AUDIENCES)).max(TARGET_AUDIENCES.length).optional(),
  salesChannels: z.array(z.enum(SALES_CHANNELS)).max(SALES_CHANNELS.length).optional(),
  productCategories: z.array(z.enum(APPLICATION_CATEGORIES)).max(APPLICATION_CATEGORIES.length).optional(),
  inventoryModels: z
    .array(z.enum(["in_stock", "made_to_order", "pre_order", "limited_drops", "seasonal", "consignment"]))
    .max(6)
    .optional(),
  shippingCoverage: z
    .array(z.enum(["cairo_giza", "alexandria", "major_cities", "nationwide", "selected_areas", "international"]))
    .max(6)
    .optional(),
  agreementAccurate: z.boolean().optional(),
  agreementAuthorized: z.boolean().optional(),
  agreementReview: z.boolean().optional(),
});

export const brandApplicationDraftPayloadSchema = z.object({
  applicationData: brandApplicationDraftDataSchema,
  currentStep: z.number().int().min(1).max(5),
  lockVersion: z.number().int().nonnegative().optional(),
});

export const brandApplicationSubmitPayloadSchema = z.object({
  applicationData: brandApplicationDataSchema,
  currentStep: z.literal(5),
  lockVersion: z.number().int().nonnegative().optional(),
  applicantResponse: optional(1000),
});

export type BrandApplicationDraftPayload = z.infer<typeof brandApplicationDraftPayloadSchema>;
export type BrandApplicationSubmitPayload = z.infer<typeof brandApplicationSubmitPayloadSchema>;

export type StructuredValidationError = {
  step: number;
  section: string;
  field: string;
  message: string;
  blocking: true;
};

const STEP_BY_FIELD: Record<string, { step: number; section: string }> = {
  fullName: { step: 1, section: "contact" },
  businessEmail: { step: 1, section: "contact" },
  phone: { step: 1, section: "contact" },
  applicantRole: { step: 1, section: "contact" },
  preferredContactMethod: { step: 1, section: "contact" },
  brandName: { step: 2, section: "identity" },
  primaryCategory: { step: 2, section: "identity" },
  targetAudiences: { step: 2, section: "identity" },
  shortDescription: { step: 2, section: "story" },
  fullBrandStory: { step: 2, section: "story" },
  brandDifference: { step: 2, section: "story" },
  salesChannels: { step: 2, section: "presence" },
  businessType: { step: 3, section: "verification" },
  legalBusinessName: { step: 3, section: "verification" },
  productCategories: { step: 4, section: "products" },
  typicalMinimumPrice: { step: 4, section: "products" },
  typicalMaximumPrice: { step: 4, section: "products" },
  manufacturingModel: { step: 4, section: "manufacturing" },
  inventoryModels: { step: 4, section: "inventory" },
  agreementAccurate: { step: 5, section: "agreements" },
  agreementAuthorized: { step: 5, section: "agreements" },
  agreementReview: { step: 5, section: "agreements" },
};

export function structuredErrors(error: z.ZodError): StructuredValidationError[] {
  return error.issues.map((issue) => {
    const field = String(issue.path[0] ?? "application");
    const location = STEP_BY_FIELD[field] ?? { step: 4, section: "operations" };
    return { ...location, field, message: issue.message, blocking: true as const };
  });
}
