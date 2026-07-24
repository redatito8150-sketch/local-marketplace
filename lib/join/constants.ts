import type { ApplicantRole, ApplicationStatus, LegalStatus } from "@/types";

export { ACTIVE_APPLICATION_STATUSES } from "@/types";

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

export const LEGAL_STATUS_OPTIONS: { value: LegalStatus; label: string }[] = [
  { value: "both_docs", label: "We have both a commercial registration and tax card" },
  { value: "commercial_registration_only", label: "We have a commercial registration only" },
  { value: "tax_card_only", label: "We have a tax card only" },
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
  "Own website",
  "Physical store",
  "Pop-up markets",
  "Other marketplaces",
  "Other",
] as const;

export const PRODUCT_CATEGORY_OPTIONS = [
  "Women's Fashion",
  "Men's Fashion",
  "Kids",
  "Accessories",
  "Home & Living",
  "Beauty",
  "Other",
] as const;

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
