import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  isEgyptGovernorate,
  isValidStatusTransition,
  isWithinReapplicationCooldown,
  WEBSITE_CHANNEL,
} from "@/lib/join/constants";
import type { DraftApplicationInput, SubmitApplicationInput } from "@/lib/join/validation";
import type {
  ApplicantAccountSnapshot,
  ApplicationStatus,
  BrandApplicationDocumentRecord,
  BrandApplicationRecord,
  BrandApplicationStatusHistoryEntry,
} from "@/types";

// Service-role-backed functions for the brand application workflow. Every
// export here assumes the caller (a route handler) already resolved and
// authorized the acting user — none of these take a client-supplied user id,
// they all take an already-verified `userId` string. Never call this module
// from a client component.

interface BrandApplicationRow {
  id: string;
  brand_name: string;
  founder_name: string;
  email: string;
  phone: string;
  instagram_or_website: string;
  product_category: string;
  brand_story: string;
  sales_channels: string | null;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
  applicant_user_id: string | null;
  applicant_role: string | null;
  applicant_role_other: string | null;
  brand_name_ar: string | null;
  brand_name_en: string | null;
  website_url: string | null;
  other_social_urls: string[];
  additional_categories: string[];
  founding_year: number | null;
  country: string | null;
  city: string | null;
  sales_channels_list: string[];
  sales_channel_links: Record<string, string>;
  approx_product_count: number | null;
  approx_monthly_orders: string | null;
  approx_product_count_range: string | null;
  approx_monthly_orders_range: string | null;
  legal_status: string | null;
  commercial_registration_number: string | null;
  tax_registration_number: string | null;
  legal_business_name: string | null;
  product_price_range: string | null;
  products_manufactured_by_brand: boolean | null;
  made_to_order: boolean | null;
  avg_preparation_time: string | null;
  shipping_coverage: string | null;
  return_exchange_available: boolean | null;
  inventory_status: string | null;
  price_min: number | null;
  price_max: number | null;
  manufacturing_model: string | null;
  fulfillment_model: string | null;
  avg_preparation_time_range: string | null;
  shipping_coverage_option: string | null;
  shipping_governorates: string[];
  returns_policy: string | null;
  inventory_model: string[];
  consent_accurate: boolean;
  consent_terms: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  admin_notes: string | null;
  changes_requested_message: string | null;
  approved_brand_id: string | null;
  reapplication_allowed_at: string | null;
  reapplication_override: boolean;
  converted_at: string | null;
  converted_by: string | null;
  applicant_account_snapshot: ApplicantAccountSnapshot | null;
  reference_number: string | null;
  schema_version: number | null;
  preferred_contact_method: string | null;
  application_data: Record<string, unknown> | null;
  current_step: number | null;
  last_saved_at: string | null;
  lock_version: number | null;
  submitted_at: string | null;
  requested_sections: string[] | null;
  requested_fields: string[] | null;
  applicant_visible_message: string | null;
  information_response_deadline: string | null;
  last_resubmitted_at: string | null;
  converted_brand_id: string | null;
}

export function toBrandApplicationRecord(row: BrandApplicationRow): BrandApplicationRecord {
  return {
    id: row.id,
    brandName: row.brand_name,
    founderName: row.founder_name,
    email: row.email,
    phone: row.phone,
    instagramOrWebsite: row.instagram_or_website,
    productCategory: row.product_category,
    brandStory: row.brand_story,
    salesChannels: row.sales_channels,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    applicantUserId: row.applicant_user_id,
    applicantRole: (row.applicant_role as BrandApplicationRecord["applicantRole"]) ?? null,
    applicantRoleOther: row.applicant_role_other ?? undefined,
    brandNameAr: row.brand_name_ar ?? undefined,
    brandNameEn: row.brand_name_en ?? undefined,
    websiteUrl: row.website_url ?? undefined,
    otherSocialUrls: row.other_social_urls ?? [],
    additionalCategories: row.additional_categories ?? [],
    foundingYear: row.founding_year ?? undefined,
    country: row.country ?? undefined,
    city: row.city && isEgyptGovernorate(row.city) ? row.city : undefined,
    salesChannelsList: row.sales_channels_list ?? [],
    salesChannelLinks: row.sales_channel_links ?? {},
    approxProductCount: row.approx_product_count ?? undefined,
    approxMonthlyOrders: row.approx_monthly_orders ?? undefined,
    approxProductCountRange:
      (row.approx_product_count_range as BrandApplicationRecord["approxProductCountRange"]) ?? undefined,
    approxMonthlyOrdersRange:
      (row.approx_monthly_orders_range as BrandApplicationRecord["approxMonthlyOrdersRange"]) ?? undefined,
    legalStatus: (row.legal_status as BrandApplicationRecord["legalStatus"]) ?? null,
    commercialRegistrationNumber: row.commercial_registration_number ?? undefined,
    taxRegistrationNumber: row.tax_registration_number ?? undefined,
    legalBusinessName: row.legal_business_name ?? undefined,
    productPriceRange: row.product_price_range ?? undefined,
    productsManufacturedByBrand: row.products_manufactured_by_brand ?? undefined,
    madeToOrder: row.made_to_order ?? undefined,
    avgPreparationTime: row.avg_preparation_time ?? undefined,
    shippingCoverage: row.shipping_coverage ?? undefined,
    returnExchangeAvailable: row.return_exchange_available ?? undefined,
    inventoryStatus: row.inventory_status ?? undefined,
    priceMin: row.price_min ?? undefined,
    priceMax: row.price_max ?? undefined,
    manufacturingModel: (row.manufacturing_model as BrandApplicationRecord["manufacturingModel"]) ?? undefined,
    fulfillmentModel: (row.fulfillment_model as BrandApplicationRecord["fulfillmentModel"]) ?? undefined,
    avgPreparationTimeRange:
      (row.avg_preparation_time_range as BrandApplicationRecord["avgPreparationTimeRange"]) ?? undefined,
    shippingCoverageOption:
      (row.shipping_coverage_option as BrandApplicationRecord["shippingCoverageOption"]) ?? undefined,
    shippingGovernorates: (row.shipping_governorates ?? []).filter(isEgyptGovernorate),
    returnsPolicy: (row.returns_policy as BrandApplicationRecord["returnsPolicy"]) ?? undefined,
    inventoryModel: row.inventory_model ?? [],
    consentAccurate: row.consent_accurate,
    consentTerms: row.consent_terms,
    reviewedAt: row.reviewed_at ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    adminNotes: row.admin_notes ?? undefined,
    changesRequestedMessage: row.changes_requested_message ?? undefined,
    approvedBrandId: row.approved_brand_id ?? undefined,
    reapplicationAllowedAt: row.reapplication_allowed_at ?? undefined,
    reapplicationOverride: row.reapplication_override,
    convertedAt: row.converted_at ?? undefined,
    convertedBy: row.converted_by ?? undefined,
    applicantAccountSnapshot: row.applicant_account_snapshot,
    referenceNumber: row.reference_number ?? undefined,
    schemaVersion: row.schema_version ?? undefined,
    preferredContactMethod:
      (row.preferred_contact_method as BrandApplicationRecord["preferredContactMethod"]) ?? undefined,
    applicationData:
      (row.application_data as BrandApplicationRecord["applicationData"]) ?? undefined,
    currentStep: row.current_step ?? undefined,
    lastSavedAt: row.last_saved_at ?? undefined,
    lockVersion: row.lock_version ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    requestedSections: row.requested_sections ?? [],
    requestedFields: row.requested_fields ?? [],
    applicantVisibleMessage: row.applicant_visible_message ?? undefined,
    informationResponseDeadline: row.information_response_deadline ?? undefined,
    lastResubmittedAt: row.last_resubmitted_at ?? undefined,
    convertedBrandId: row.converted_brand_id ?? undefined,
  };
}

export class ApplicationServiceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ApplicationServiceError";
  }
}

// Snapshot of the authenticated account at submission/draft-creation time —
// never overwritten by application-entered fields, kept separate so admins
// can compare "what the account says" vs. "what the applicant typed."
export async function getApplicantAccountSnapshot(user: User): Promise<ApplicantAccountSnapshot> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email, phone")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`getApplicantAccountSnapshot(${user.id}) failed: ${error.message}`);
  }

  return {
    fullName: data?.full_name ?? null,
    email: data?.email ?? user.email ?? null,
    phone: data?.phone ?? null,
    accountCreatedAt: user.created_at,
  };
}

// The applicant's own current application (active one preferred, else most
// recent), used to drive "resume your application" / "view your status" UI.
export async function getMyApplication(userId: string): Promise<BrandApplicationRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("brand_applications")
    .select("*")
    .eq("applicant_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`getMyApplication(${userId}) failed: ${error.message}`);
  }
  if (!data) return null;
  return toBrandApplicationRecord(data as BrandApplicationRow);
}

function draftInputToRow(input: DraftApplicationInput) {
  const websiteLink = input.salesChannelLinks?.[WEBSITE_CHANNEL];
  return {
    // brand_name/product_category/brand_story are NOT NULL at the DB level
    // (pre-dating this multi-step redesign — see schema.sql), but a draft
    // saved after step 1 ("About you") hasn't collected them yet. Default to
    // "" rather than leaving them undefined, same fallback already used for
    // instagram_or_website below, so an early draft save doesn't 500 on a
    // not-null violation.
    brand_name: input.brandNameEn ?? "",
    founder_name: input.founderName,
    email: input.email,
    phone: input.phone,
    // Legacy NOT NULL column, superseded by sales_channel_links below —
    // instagramUsername/websiteUrl no longer exist as separate inputs on
    // the new form, so this just mirrors the "Website" channel's link.
    instagram_or_website: websiteLink || "",
    product_category: input.productCategory ?? "",
    brand_story: input.brandStory ?? "",
    applicant_role: input.applicantRole,
    applicant_role_other: input.applicantRoleOther,
    brand_name_ar: input.brandNameAr,
    brand_name_en: input.brandNameEn,
    // Mirrored rather than cleared when absent (undefined = key omitted,
    // existing value untouched), so admin brand-creation prefill
    // (app/admin/brands/new) keeps reading a real value.
    website_url: websiteLink || undefined,
    founding_year: input.foundingYear,
    country: input.country,
    city: input.city,
    sales_channels_list: input.salesChannelsList,
    sales_channel_links: input.salesChannelLinks ?? {},
    approx_product_count_range: input.approxProductCountRange,
    approx_monthly_orders_range: input.approxMonthlyOrdersRange,
    legal_status: input.legalStatus,
    commercial_registration_number: input.commercialRegistrationNumber,
    tax_registration_number: input.taxRegistrationNumber,
    legal_business_name: input.legalBusinessName,
    price_min: input.priceMin,
    price_max: input.priceMax,
    manufacturing_model: input.manufacturingModel,
    fulfillment_model: input.fulfillmentModel,
    avg_preparation_time_range: input.avgPreparationTimeRange,
    shipping_coverage_option: input.shippingCoverageOption,
    shipping_governorates: input.shippingGovernorates,
    returns_policy: input.returnsPolicy,
    inventory_model: input.inventoryModel,
    consent_accurate: input.consentAccurate ?? false,
    consent_terms: input.consentTerms ?? false,
  };
}

// Creates a new draft, or updates the applicant's existing draft /
// changes_requested application in place. If the applicant's most recent
// application is in a terminal, inactive state (rejected past its cooldown,
// withdrawn, approved, converted_to_brand) this starts a brand-new row
// instead of trying to edit the old one — only an active, non-editable
// status (submitted/under_review/resubmitted/approved_pending_creation)
// blocks a new submission outright. The partial unique index remains the
// real backstop against a race; this is just the friendly pre-check.
export async function createOrUpdateDraft(
  userId: string,
  accountSnapshot: ApplicantAccountSnapshot,
  input: DraftApplicationInput
): Promise<BrandApplicationRecord> {
  const existing = await getMyApplication(userId);

  if (existing && !isEditableStatus(existing.status) && isActiveStatus(existing.status)) {
    throw new ApplicationServiceError(
      "APPLICATION_NOT_EDITABLE",
      `Your application is currently "${existing.status}" and can no longer be edited.`
    );
  }
  if (existing && isWithinReapplicationCooldown(existing)) {
    const until = existing.reapplicationAllowedAt
      ? new Date(existing.reapplicationAllowedAt).toLocaleDateString()
      : "later";
    throw new ApplicationServiceError(
      "REAPPLICATION_COOLDOWN_ACTIVE",
      `You can submit a new application after ${until}.`
    );
  }

  const startNewRow = existing !== null && !isEditableStatus(existing.status);
  const row = draftInputToRow(input);

  if (existing && !startNewRow) {
    const { data, error } = await supabaseAdmin
      .from("brand_applications")
      .update(row)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw new Error(`createOrUpdateDraft(update ${existing.id}) failed: ${error.message}`);
    }
    return toBrandApplicationRecord(data as BrandApplicationRow);
  }

  const { data, error } = await supabaseAdmin
    .from("brand_applications")
    .insert({
      ...row,
      applicant_user_id: userId,
      applicant_account_snapshot: accountSnapshot,
      status: "draft" as ApplicationStatus,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApplicationServiceError(
        "ALREADY_HAS_ACTIVE_APPLICATION",
        "You already have an active brand application."
      );
    }
    throw new Error(`createOrUpdateDraft(insert) failed: ${error.message}`);
  }
  return toBrandApplicationRecord(data as BrandApplicationRow);
}

function isEditableStatus(status: ApplicationStatus): boolean {
  return status === "draft" || status === "changes_requested";
}

const ACTIVE_STATUSES: ApplicationStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "changes_requested",
  "resubmitted",
  "approved_pending_creation",
];

function isActiveStatus(status: ApplicationStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

// Validates + transitions draft/changes_requested -> submitted (or
// resubmitted, when coming from changes_requested). The unique partial index
// is the real backstop against a race; this still pre-checks for a clean
// error message in the common case.
export async function submitApplication(
  userId: string,
  input: SubmitApplicationInput
): Promise<BrandApplicationRecord> {
  const existing = await getMyApplication(userId);
  if (!existing) {
    throw new ApplicationServiceError("APPLICATION_NOT_FOUND", "No draft application found to submit.");
  }
  if (!isEditableStatus(existing.status)) {
    throw new ApplicationServiceError(
      "APPLICATION_NOT_EDITABLE",
      `Your application is currently "${existing.status}" and cannot be submitted.`
    );
  }

  const nextStatus: ApplicationStatus =
    existing.status === "changes_requested" ? "resubmitted" : "submitted";
  if (!isValidStatusTransition(existing.status, nextStatus)) {
    throw new ApplicationServiceError(
      "INVALID_TRANSITION",
      `Cannot move from "${existing.status}" to "${nextStatus}".`
    );
  }

  const row = draftInputToRow(input);
  const { data, error } = await supabaseAdmin
    .from("brand_applications")
    .update({ ...row, status: nextStatus })
    .eq("id", existing.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`submitApplication(${existing.id}) failed: ${error.message}`);
  }

  await recordStatusHistory(existing.id, existing.status, nextStatus, userId, null);
  return toBrandApplicationRecord(data as BrandApplicationRow);
}

export async function withdrawApplication(userId: string): Promise<BrandApplicationRecord> {
  const existing = await getMyApplication(userId);
  if (!existing) {
    throw new ApplicationServiceError("APPLICATION_NOT_FOUND", "No application found to withdraw.");
  }
  if (!isValidStatusTransition(existing.status, "withdrawn")) {
    throw new ApplicationServiceError(
      "INVALID_TRANSITION",
      `Cannot withdraw an application that is currently "${existing.status}".`
    );
  }

  const { data, error } = await supabaseAdmin
    .from("brand_applications")
    .update({ status: "withdrawn" as ApplicationStatus })
    .eq("id", existing.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`withdrawApplication(${existing.id}) failed: ${error.message}`);
  }

  await recordStatusHistory(existing.id, existing.status, "withdrawn", userId, null);
  return toBrandApplicationRecord(data as BrandApplicationRow);
}

export async function recordStatusHistory(
  applicationId: string,
  fromStatus: ApplicationStatus | null,
  toStatus: ApplicationStatus,
  changedBy: string | null,
  reason: string | null
): Promise<void> {
  const { error } = await supabaseAdmin.from("brand_application_status_history").insert({
    application_id: applicationId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: changedBy,
    reason,
  });

  if (error) {
    throw new Error(`recordStatusHistory(${applicationId}) failed: ${error.message}`);
  }
}

// Pure, DB-free logic — lives in constants.ts so it can be unit-tested
// without importing the service-role client (and therefore without
// needing Supabase credentials just to run `node --test`). Re-exported
// here so existing call sites don't need to change their import path.
export { isWithinReapplicationCooldown, computeReapplicationAllowedAt } from "./constants.ts";

export function toDocumentRecord(row: {
  id: string;
  application_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
  document_type?: string | null;
  upload_status?: string | null;
}): BrandApplicationDocumentRecord {
  return {
    id: row.id,
    applicationId: row.application_id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    createdAt: row.created_at,
    documentType:
      (row.document_type as BrandApplicationDocumentRecord["documentType"]) ?? "other_supporting_document",
    uploadStatus:
      (row.upload_status as BrandApplicationDocumentRecord["uploadStatus"]) ?? "uploaded",
  };
}

// Used by both the applicant's own document route and the admin detail
// page — no ownership check here, since each caller is responsible for
// verifying the applicant/admin can see this application before calling.
export async function getApplicationDocuments(
  applicationId: string
): Promise<BrandApplicationDocumentRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("brand_application_documents")
    .select("*")
    .eq("application_id", applicationId)
    .is("removed_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getApplicationDocuments(${applicationId}) failed: ${error.message}`);
  }
  return (data ?? []).map(toDocumentRecord);
}

function toStatusHistoryEntry(row: {
  id: string;
  application_id: string;
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}): BrandApplicationStatusHistoryEntry {
  return {
    id: row.id,
    applicationId: row.application_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedBy: row.changed_by,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export async function getApplicationStatusHistory(
  applicationId: string
): Promise<BrandApplicationStatusHistoryEntry[]> {
  const { data, error } = await supabaseAdmin
    .from("brand_application_status_history")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getApplicationStatusHistory(${applicationId}) failed: ${error.message}`);
  }
  return (data ?? []).map(toStatusHistoryEntry);
}
