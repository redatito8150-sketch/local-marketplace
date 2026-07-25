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
} from "./constants.ts";

const trimmedString = (max: number) => z.string().trim().max(max);
const requiredString = (label: string, max: number) =>
  trimmedString(max).min(1, `${label} is required`);
const optionalString = (max: number) =>
  trimmedString(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));

// Kept as a plain ZodObject (no .refine()) for the same mergeable/partial-
// able reason as legalInfoObjectSchema below — applicantInfoRefinements()
// is applied separately wherever this ends up (step-level or full-submit).
export const applicantInfoObjectSchema = z.object({
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
  // Only meaningful when applicantRole === "other" — see the refinement below.
  applicantRoleOther: optionalString(120),
});

function applicantInfoRefinements<
  T extends { applicantRole: string; applicantRoleOther?: string }
>(schema: z.ZodType<T>) {
  return schema.refine(
    (data) => data.applicantRole !== "other" || Boolean(data.applicantRoleOther),
    { message: "Please specify your role", path: ["applicantRoleOther"] }
  );
}

export const applicantInfoSchema = applicantInfoRefinements(applicantInfoObjectSchema);

// Main product category is a multi-select (unlike the old single required
// dropdown) — the applicant can pick as many as apply, or none at draft
// time. Sales channel links replace the old Instagram-username/website-url/
// other-social-urls trio with one {channel: link} map, since the form now
// collects a single link per selected channel instead of the same
// information three different ways.
export const brandInfoSchema = z.object({
  brandNameAr: requiredString("Brand name (Arabic)", 120),
  brandNameEn: requiredString("Brand name (English)", 120),
  productCategories: z.array(trimmedString(60)).max(10).default([]),
  brandStory: optionalString(2000),
  foundingYear: z
    .number({ required_error: "Founding year is required" })
    .int()
    .min(1900)
    .max(new Date().getFullYear()),
  country: requiredString("Country", 80),
  city: requiredString("City", 80),
  salesChannelsList: z.array(trimmedString(60)).min(1, "Select at least one sales channel").max(10),
  salesChannelLinks: z.record(z.string(), trimmedString(300)).default({}),
  approxProductCount: z
    .number({ required_error: "Approx. product count is required" })
    .int()
    .min(0)
    .max(1_000_000),
  approxMonthlyOrders: requiredString("Approx. monthly orders", 60),
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
// plus the conditional-field checks (legal status, "other" role) applied
// once at the end.
const submitApplicationObjectSchema = applicantInfoObjectSchema
  .merge(brandInfoSchema)
  .merge(legalInfoObjectSchema)
  .merge(operationsInfoSchema)
  .merge(consentSchema);

export const submitApplicationSchema = legalInfoRefinements(
  applicantInfoRefinements(submitApplicationObjectSchema)
);

export type SubmitApplicationInput = z.infer<typeof submitApplicationSchema>;

// Draft saves accept a partial slice of any step, since the applicant can
// leave and come back mid-form — required-ness is only enforced at submit
// time, not while drafting.
export const draftApplicationSchema = applicantInfoObjectSchema
  .partial()
  .merge(brandInfoSchema.partial())
  .merge(legalInfoObjectSchema.partial())
  .merge(operationsInfoSchema.partial())
  .merge(consentSchema.partial());

export type DraftApplicationInput = z.infer<typeof draftApplicationSchema>;
