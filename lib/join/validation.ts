// Zod schemas for the brand application form — this project's first use of
// Zod (see the plan's "conflicts" section: no schema library exists
// elsewhere in the web app yet). These are shared by the client form (for
// instant feedback) and the submit API route, but the route re-validates
// independently server-side regardless — never trusts that client-side
// validation ran at all, same rule every other route in this project follows.
import { z } from "zod";
import {
  EGYPT_GOVERNORATES,
  INVENTORY_MODEL_VALUES,
  LEGAL_STATUSES_WITH_COMMERCIAL_REGISTRATION,
  LEGAL_STATUSES_WITH_TAX_CARD,
  SALES_CHANNEL_LINK_CONFIG,
} from "./constants.ts";

const trimmedString = (max: number) => z.string().trim().max(max);
const requiredString = (label: string, max: number) =>
  trimmedString(max).min(1, `${label} is required`);
const optionalString = (max: number) =>
  trimmedString(max).optional().or(z.literal("")).transform((v) => (v ? v : undefined));

const INVENTORY_MODEL_VALUE_LIST = Object.values(INVENTORY_MODEL_VALUES) as [string, ...string[]];

// Kept as a plain ZodObject (no .refine()) for the same mergeable/partial-
// able reason as legalInfoObjectSchema below — applicantInfoRefinements()
// is applied separately wherever this ends up (step-level or full-submit).
export const applicantInfoObjectSchema = z.object({
  founderName: requiredString("Full name", 120),
  email: requiredString("Business email", 254).email("Enter a valid email address"),
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

// One link field per selected sales channel, validated as a real URL only
// for the channels SALES_CHANNEL_LINK_CONFIG marks strict (Instagram,
// Facebook, TikTok, Website) — Pop-up markets/Other marketplaces accept a
// URL or short free text instead.
const salesChannelLinksSchema = z
  .record(z.string(), trimmedString(300))
  .default({})
  .superRefine((links, ctx) => {
    for (const [channel, config] of Object.entries(SALES_CHANNEL_LINK_CONFIG)) {
      if (!config.strictUrl) continue;
      const value = links[channel];
      if (value && !/^https?:\/\/.+/i.test(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Enter a valid URL for ${config.label}`,
          path: [channel],
        });
      }
    }
  });

export const brandInfoSchema = z.object({
  brandNameAr: requiredString("Brand name (Arabic)", 120),
  brandNameEn: requiredString("Brand name (English)", 120),
  // The applicant picks one or more categories client-side (including a
  // typed-in "Other" category); by the time it reaches this schema it's
  // already been resolved into a required primary category (free text, so
  // a custom "Other" value validates the same as a preset one) plus an
  // optional list of additional categories.
  productCategory: requiredString("Category", 60),
  additionalCategories: z.array(trimmedString(60)).max(10).optional().default([]),
  brandStory: optionalString(500),
  foundingYear: z
    .number({ required_error: "Founding year is required" })
    .int()
    .min(1900)
    .max(new Date().getFullYear()),
  country: requiredString("Country", 80),
  city: z.enum(EGYPT_GOVERNORATES, { errorMap: () => ({ message: "City is required" }) }),
  salesChannelsList: z.array(trimmedString(60)).min(1, "Select at least one sales channel").max(10),
  salesChannelLinks: salesChannelLinksSchema,
  approxProductCountRange: z.enum(["0_20", "20_100", "100_500", "500_plus"], {
    errorMap: () => ({ message: "Approx. product count is required" }),
  }),
  approxMonthlyOrdersRange: z.enum(["0_20", "20_100", "100_500", "500_plus"], {
    errorMap: () => ({ message: "Approx. monthly orders is required" }),
  }),
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

// Kept as a plain ZodObject (no .refine()) for the same mergeable/partial-
// able reason as legalInfoObjectSchema — operationsInfoRefinements() below
// is applied separately (step-level or full-submit).
export const operationsInfoObjectSchema = z.object({
  priceMin: z.number().min(0, "Minimum price cannot be negative").optional(),
  priceMax: z.number().min(0, "Maximum price cannot be negative").optional(),
  // The single most important operational question — required, unlike the
  // legacy fields below which stay optional/unused going forward.
  fulfillmentResponsibility: z.enum(["brand_handles", "mahaly_handles"], {
    errorMap: () => ({ message: "Please choose who will handle packaging and fulfillment" }),
  }),
  // Legacy fields — no longer collected by the form (removed from the UI),
  // kept optional here only so old drafts/submissions still parse.
  manufacturingModel: z.enum(["own_production", "external_manufacturer", "mixed"]).optional(),
  fulfillmentModel: z.enum(["ready_to_ship", "made_to_order", "both"]).optional(),
  avgPreparationTimeRange: z
    .enum(["same_day", "1_2_days", "3_5_days", "6_7_days", "more_than_week"])
    .optional(),
  shippingCoverageOption: z.enum(["all_egypt", "selected_governorates", "international"]).optional(),
  shippingGovernorates: z.array(z.enum(EGYPT_GOVERNORATES)).max(27).default([]),
  returnsPolicy: z
    .enum(["returns_and_exchanges", "exchanges_only", "no_returns", "depends_on_product"])
    .optional(),
  returnsPolicyDetails: optionalString(500),
  inventoryModel: z.array(z.enum(INVENTORY_MODEL_VALUE_LIST)).max(4).default([]),
});

function operationsInfoRefinements<
  T extends {
    priceMin?: number;
    priceMax?: number;
    shippingCoverageOption?: string;
    shippingGovernorates?: string[];
  }
>(schema: z.ZodType<T>) {
  return schema
    .refine(
      (data) =>
        data.priceMin === undefined || data.priceMax === undefined || data.priceMax >= data.priceMin,
      { message: "Maximum price must be greater than or equal to minimum price", path: ["priceMax"] }
    )
    .refine(
      (data) =>
        data.shippingCoverageOption !== "selected_governorates" ||
        (data.shippingGovernorates && data.shippingGovernorates.length > 0),
      { message: "Select at least one governorate", path: ["shippingGovernorates"] }
    );
}

export const operationsInfoSchema = operationsInfoRefinements(operationsInfoObjectSchema);

export const consentSchema = z.object({
  consentAccurate: z.literal(true, { errorMap: () => ({ message: "Please confirm the information is accurate" }) }),
  consentTerms: z.literal(true, { errorMap: () => ({ message: "Please accept the review and privacy terms" }) }),
});

// Full submit-time schema — every step merged, everything above required,
// plus the conditional-field checks (legal status, "other" role, price
// range, selected-governorates) applied once at the end.
const submitApplicationObjectSchema = applicantInfoObjectSchema
  .merge(brandInfoSchema)
  .merge(legalInfoObjectSchema)
  .merge(operationsInfoObjectSchema)
  .merge(consentSchema);

export const submitApplicationSchema = legalInfoRefinements(
  applicantInfoRefinements(operationsInfoRefinements(submitApplicationObjectSchema))
);

export type SubmitApplicationInput = z.infer<typeof submitApplicationSchema>;

// Draft saves accept a partial slice of any step, since the applicant can
// leave and come back mid-form — required-ness is only enforced at submit
// time, not while drafting.
export const draftApplicationSchema = applicantInfoObjectSchema
  .partial()
  .merge(brandInfoSchema.partial())
  .merge(legalInfoObjectSchema.partial())
  .merge(operationsInfoObjectSchema.partial())
  .merge(consentSchema.partial());

export type DraftApplicationInput = z.infer<typeof draftApplicationSchema>;
