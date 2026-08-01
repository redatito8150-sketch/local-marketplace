import type {
  ApplicantRole,
  ApplicationStatus,
  BrandApplicationRecord,
  BusinessSizeRange,
  EgyptGovernorate,
  FulfillmentModel,
  FulfillmentResponsibility,
  LegalStatus,
  ManufacturingModel,
  PreparationTimeRange,
  ReturnsPolicy,
  ShippingCoverageOption,
} from "@/types";

export { ACTIVE_APPLICATION_STATUSES } from "../../types/index.ts";

// How long a rejected applicant must wait before they're allowed to submit
// a new application, unless an admin explicitly overrides it earlier. One
// named constant so it can change later without hunting through the code —
// per the brief's own "define it centrally" requirement.
export const REAPPLICATION_COOLDOWN_DAYS = 30;

export const APPLICANT_ROLES: { value: ApplicantRole; label: string }[] = [
  { value: "founder", label: "Founder" },
  { value: "co_founder", label: "Co-founder" },
  { value: "manager", label: "Manager" },
  { value: "employee", label: "Employee" },
  { value: "agency_representative", label: "Agency representative" },
  { value: "other", label: "Other" },
];

// "*_only" statuses (commercial_registration_only / tax_card_only) were
// removed from this presented list on purpose — the type/DB value still
// exist so pre-existing applications that already picked one keep
// displaying correctly, but new applicants can no longer select them.
export const LEGAL_STATUS_OPTIONS: { value: LegalStatus; label: string }[] = [
  { value: "both_docs", label: "We have both a commercial registration and tax card" },
  { value: "documents_pending", label: "Documents are currently being issued" },
  { value: "unregistered_individual", label: "We operate as an individual business without registration" },
  { value: "other", label: "Other" },
];

// Legal statuses where a commercial registration number is meaningfully
// collectible — used to conditionally show that field, both here and
// mirrored in the Zod schema below.
export const LEGAL_STATUSES_WITH_COMMERCIAL_REGISTRATION: LegalStatus[] = [
  "both_docs",
  "commercial_registration_only",
];
export const LEGAL_STATUSES_WITH_TAX_CARD: LegalStatus[] = ["both_docs", "tax_card_only"];

export const SALES_CHANNEL_OPTIONS = [
  "Instagram",
  "Facebook",
  "TikTok",
  "Website",
  "Physical store",
  "Pop-up markets",
  "Other marketplaces",
] as const;

// The one sales channel whose link doubles as the brand's website —
// applicationService.ts mirrors it into the legacy website_url column so
// admin brand-creation prefill (app/admin/brands/new) keeps working.
export const WEBSITE_CHANNEL = "Website";

// Per-channel link field config — Physical store has no entry (no field
// shown at all); the four "*_URL" channels are validated as real URLs,
// Pop-up markets/Other marketplaces accept a URL or short free text instead
// since a market or marketplace often isn't a single canonical link.
export const SALES_CHANNEL_LINK_CONFIG: Record<string, { label: string; strictUrl: boolean }> = {
  Instagram: { label: "Instagram URL", strictUrl: true },
  Facebook: { label: "Facebook URL", strictUrl: true },
  TikTok: { label: "TikTok URL", strictUrl: true },
  [WEBSITE_CHANNEL]: { label: "Website URL", strictUrl: true },
  "Pop-up markets": { label: "Pop-up markets details", strictUrl: false },
  "Other marketplaces": { label: "Marketplace details", strictUrl: false },
};

// "Other" used to be a preset pill gated behind a single free-text field —
// replaced by the always-available category TagInput below the pills
// (ApplyBrandForm.tsx), which supports any number of custom categories
// instead of just one.
export const PRODUCT_CATEGORY_OPTIONS = [
  "Women's Fashion",
  "Men's Fashion",
  "Kids",
  "Accessories",
  "Home & Living",
  "Beauty",
] as const;

// All 27 Egyptian governorates — the fixed, canonical list for both the
// brand-application City field and Step 4's "Selected governorates"
// shipping coverage. No custom values are ever accepted outside this list.
// `satisfies` (not a type annotation) keeps the literal tuple type intact —
// z.enum() needs the literal tuple, not the widened EgyptGovernorate[] —
// while still checking every entry really is a valid EgyptGovernorate, and
// types/index.ts's EgyptGovernorate union is the one canonical source this
// gets checked against, so the two can never silently drift apart.
export const EGYPT_GOVERNORATES = [
  "Alexandria",
  "Aswan",
  "Asyut",
  "Beheira",
  "Beni Suef",
  "Cairo",
  "Dakahlia",
  "Damietta",
  "Faiyum",
  "Gharbia",
  "Giza",
  "Ismailia",
  "Kafr El Sheikh",
  "Luxor",
  "Matrouh",
  "Minya",
  "Monufia",
  "New Valley",
  "North Sinai",
  "Port Said",
  "Qalyubia",
  "Qena",
  "Red Sea",
  "Sharqia",
  "Sohag",
  "South Sinai",
  "Suez",
] as const satisfies readonly EgyptGovernorate[];

// Real runtime narrowing for a raw DB string (e.g. brand_applications.city)
// into the typed EgyptGovernorate union — used at the one boundary where an
// untyped Postgres text column becomes a typed field, instead of a type
// assertion.
export function isEgyptGovernorate(value: string): value is EgyptGovernorate {
  return EGYPT_GOVERNORATES.some((governorate) => governorate === value);
}

export const BUSINESS_SIZE_OPTIONS: { value: BusinessSizeRange; label: string }[] = [
  { value: "0_20", label: "0–20" },
  { value: "20_100", label: "20–100" },
  { value: "100_500", label: "100–500" },
  { value: "500_plus", label: "500+" },
];

export const MANUFACTURING_MODEL_OPTIONS: { value: ManufacturingModel; label: string }[] = [
  { value: "own_production", label: "We manufacture our products" },
  { value: "external_manufacturer", label: "We work with external manufacturers" },
  { value: "mixed", label: "We use both" },
];

export const FULFILLMENT_MODEL_OPTIONS: { value: FulfillmentModel; label: string }[] = [
  { value: "ready_to_ship", label: "Ready to ship" },
  { value: "made_to_order", label: "Made to order" },
  { value: "both", label: "Both" },
];

export const PREPARATION_TIME_OPTIONS: { value: PreparationTimeRange; label: string }[] = [
  { value: "same_day", label: "Same day" },
  { value: "1_2_days", label: "1–2 business days" },
  { value: "3_5_days", label: "3–5 business days" },
  { value: "6_7_days", label: "6–7 business days" },
  { value: "more_than_week", label: "More than one week" },
];

export const SHIPPING_COVERAGE_OPTIONS: { value: ShippingCoverageOption; label: string }[] = [
  { value: "all_egypt", label: "All Egypt" },
  { value: "selected_governorates", label: "Selected governorates" },
  { value: "international", label: "International" },
];

// The single most important operational question on the application —
// whether the brand handles its own packaging/fulfillment, or wants Mahaly
// to take on packaging, shipping, and storage while the brand just manages
// its page and product listings. Rendered as a prominent, highlighted
// choice in the Products & operations step, not a plain dropdown.
export const FULFILLMENT_RESPONSIBILITY_OPTIONS: {
  value: FulfillmentResponsibility;
  title: string;
  description: string;
}[] = [
  {
    value: "brand_handles",
    title: "I'll handle packaging & fulfillment myself",
    description:
      "You pack, store, and ship every order yourself. Mahaly only lists your products and sends you the orders.",
  },
  {
    value: "mahaly_handles",
    title: "I'd like to partner with Mahaly for fulfillment",
    description:
      "Mahaly handles packaging, storage, and shipping for you — you just manage your brand page and product listings.",
  },
];

export const RETURNS_POLICY_OPTIONS: { value: ReturnsPolicy; label: string }[] = [
  { value: "returns_and_exchanges", label: "Returns and exchanges" },
  { value: "exchanges_only", label: "Exchanges only" },
  { value: "no_returns", label: "No returns or exchanges" },
  { value: "depends_on_product", label: "Depends on the product" },
];

export const INVENTORY_MODEL_OPTIONS = [
  "In stock",
  "Made to order",
  "Pre-order",
  "Limited drops",
] as const;

// Stable stored value per inventory-model label (kept short and
// database-safe, same convention as the other fixed-choice fields above).
export const INVENTORY_MODEL_VALUES: Record<(typeof INVENTORY_MODEL_OPTIONS)[number], string> = {
  "In stock": "in_stock",
  "Made to order": "made_to_order",
  "Pre-order": "pre_order",
  "Limited drops": "limited_drops",
};

// Server-authoritative status transition map — the admin PATCH route (and
// the applicant submit/withdraw routes) reject any transition not listed
// here, so an invalid jump like draft -> approved can't happen even if the
// client sends it. Client-side UI reads the same map to decide which
// actions to even show.
export const ALLOWED_STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  new: ["submitted", "under_review"], // legacy value, transitional only
  reviewing: ["approved", "rejected"], // legacy value, transitional only
  draft: ["submitted", "withdrawn"],
  submitted: ["under_review", "withdrawn"],
  under_review: ["changes_requested", "approved", "approved_pending_creation", "rejected"],
  changes_requested: ["resubmitted", "withdrawn"],
  resubmitted: ["under_review", "changes_requested", "approved", "approved_pending_creation", "rejected"],
  approved_pending_creation: ["converted_to_brand"],
  approved: ["converted_to_brand"],
  rejected: [],
  withdrawn: [],
  converted_to_brand: [],
};

export function isValidStatusTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return ALLOWED_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
export const DOCUMENTS_BUCKET = "brand-application-documents";

// Whether a user who was rejected is currently blocked from starting a new
// application by the cooldown, unless an admin already overrode it.
export function isWithinReapplicationCooldown(app: BrandApplicationRecord): boolean {
  if (app.status !== "rejected") return false;
  if (app.reapplicationOverride) return false;
  if (!app.reapplicationAllowedAt) return false;
  return new Date(app.reapplicationAllowedAt).getTime() > Date.now();
}

export function computeReapplicationAllowedAt(fromDate = new Date()): string {
  const date = new Date(fromDate);
  date.setDate(date.getDate() + REAPPLICATION_COOLDOWN_DAYS);
  return date.toISOString();
}
