// Zod schemas for the brand application form — this project's first use of
// Zod (see the plan's "conflicts" section: no schema library exists
// elsewhere in the web app yet). These are shared by the client form (for
// instant feedback) and the submit API route, but the route re-validates
// independently server-side regardless — never trusts that client-side
// validation ran at all, same rule every other route in this project follows.
import { z } from "zod";
import {
  LEGAL_STATUSES_WITH_COMMERCIAL_REGISTRATION,
  LEGAL_STATUSES_WITH_TAX_CARD,
} from "@/lib/join/constants";

const trimmedString = (max: number) => z.string().trim().max(max);
const requiredString = (label: string, max: number) =>
  trimmedString(max).min(1, `${label} is required`);
const optionalString = (max: number) =>
  trimmedString(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));

const urlOrEmpty = optionalString(300).refine(
  (value) => !value || /^https?:\/\/.+/i.test(value) || /^@?[\w.]{1,40}$/.test(value),
  { message: "Enter a valid URL or handle" }
);

export const applicantInfoSchema = z.object({
  founderName: requiredString("Full name", 120),
  email: requiredString("Email", 254).email("Enter a valid email address"),
  phone: requiredString("Phone number", 40),
  applicantRole: z.enum([
    "founder",
    "co_founder",
    "manager",
    "employee",
    "agency_representative",
    "other",
  ]),
});

export const brandInfoSchema = z.object({
  brandName: requiredString("Brand name", 120),
  brandNameAr: optionalString(120),
  brandNameEn: optionalString(120),
  instagramUsername: optionalString(60),
  websiteUrl: urlOrEmpty,
  otherSocialUrls: z.array(trimmedString(300)).max(10).default([]),
  productCategory: requiredString("Main product category", 60),
  additionalCategories: z.array(trimmedString(60)).max(10).default([]),
  brandStory: requiredString("Brand story", 2000),
  foundingYear: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear())
    .optional(),
  country: requiredString("Country", 80),
  city: requiredString("City", 80),
  salesChannelsList: z.array(trimmedString(60)).min(1, "Select at least one sales channel").max(10),
  approxProductCount: z.number().int().min(0).max(1_000_000).optional(),
  approxMonthlyOrders: optionalString(60),
});

// Kept as a plain ZodObject (no .refine()) so it stays mergeable/partial-able
// alongside the other step schemas below — the conditional-field checks are
// applied separately, via legalInfoRefinements(), wherever this object ends
// up as part of a larger schema (step-level or full-submit).
export const legalInfoObjectSchema = z.object({
  legalStatus: z.enum([
    "both_docs",
    "commercial_registration_only",
    "tax_card_only",
    "documents_pending",
    "unregistered_individual",
    "other",
  ]),
  commercialRegistrationNumber: optionalString(60),
  taxRegistrationNumber: optionalString(60),
  legalBusinessName: optionalString(160),
});

function legalInfoRefinements<
  T extends { legalStatus: string; commercialRegistrationNumber?: string; taxRegistrationNumber?: string }
>(schema: z.ZodType<T>) {
  return schema
    .refine(
      (data) =>
        !LEGAL_STATUSES_WITH_COMMERCIAL_REGISTRATION.includes(data.legalStatus as never) ||
        Boolean(data.commercialRegistrationNumber),
      { message: "Commercial registration number is required", path: ["commercialRegistrationNumber"] }
    )
    .refine(
      (data) =>
        !LEGAL_STATUSES_WITH_TAX_CARD.includes(data.legalStatus as never) ||
        Boolean(data.taxRegistrationNumber),
      { message: "Tax registration number is required", path: ["taxRegistrationNumber"] }
    );
}

export const legalInfoSchema = legalInfoRefinements(legalInfoObjectSchema);

export const operationsInfoSchema = z.object({
  productPriceRange: optionalString(80),
  productsManufacturedByBrand: z.boolean().optional(),
  madeToOrder: z.boolean().optional(),
  avgPreparationTime: optionalString(60),
  shippingCoverage: optionalString(120),
  returnExchangeAvailable: z.boolean().optional(),
  inventoryStatus: optionalString(120),
});

export const consentSchema = z.object({
  consentAccurate: z.literal(true, { errorMap: () => ({ message: "Please confirm the information is accurate" }) }),
  consentTerms: z.literal(true, { errorMap: () => ({ message: "Please accept the review and privacy terms" }) }),
});

// Full submit-time schema — every step merged, everything above required,
// plus the legal-status conditional-field checks applied once at the end.
const submitApplicationObjectSchema = applicantInfoSchema
  .merge(brandInfoSchema)
  .merge(legalInfoObjectSchema)
  .merge(operationsInfoSchema)
  .merge(consentSchema);

export const submitApplicationSchema = legalInfoRefinements(submitApplicationObjectSchema);

export type SubmitApplicationInput = z.infer<typeof submitApplicationObjectSchema>;

// Draft saves accept a partial slice of any step, since the applicant can
// leave and come back mid-form — required-ness is only enforced at submit
// time, not while drafting.
export const draftApplicationSchema = applicantInfoSchema
  .partial()
  .merge(brandInfoSchema.partial())
  .merge(legalInfoObjectSchema.partial())
  .merge(operationsInfoSchema.partial())
  .merge(consentSchema.partial());

export type DraftApplicationInput = z.infer<typeof draftApplicationSchema>;
