import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ApplicationServiceError,
  getApplicantAccountSnapshot,
  getMyApplication,
  toBrandApplicationRecord,
} from "@/lib/join/applicationService";
import type {
  BrandApplicationDraftPayload,
  BrandApplicationSubmitPayload,
} from "@/lib/join/rebuildValidation";
import type { BrandApplicationData, BrandApplicationRecord } from "@/types";

function compatibilityFields(data: Partial<BrandApplicationData>) {
  const website = data.socialLinks?.Website?.url ?? "";
  return {
    founder_name: data.fullName ?? "",
    email: data.businessEmail ?? "",
    phone: data.phone ?? "",
    applicant_role: data.applicantRole === "other" ? "other" : data.applicantRole ?? null,
    applicant_role_other: data.applicantRoleOther || null,
    preferred_contact_method: data.preferredContactMethod ?? null,
    brand_name: data.brandName ?? "",
    brand_name_en: data.brandName ?? null,
    brand_name_ar: data.brandNameAr || null,
    product_category: data.primaryCategory ?? "",
    brand_story: data.fullBrandStory ?? "",
    country: data.country ?? null,
    city: data.city ?? null,
    founding_year: data.foundedYear ?? null,
    website_url: website || null,
    instagram_or_website: website,
    sales_channels_list: data.salesChannels ?? [],
    sales_channel_links: Object.fromEntries(
      Object.entries(data.socialLinks ?? {}).flatMap(([channel, value]) =>
        value.url || value.handle ? [[channel, value.url || value.handle || ""]] : []
      )
    ),
    legal_business_name: data.legalBusinessName || null,
    commercial_registration_number: data.commercialRegistrationNumber || null,
    tax_registration_number: data.taxRegistrationNumber || null,
    price_min: data.typicalMinimumPrice ?? null,
    price_max: data.typicalMaximumPrice ?? null,
    inventory_model: data.inventoryModels ?? [],
    consent_accurate: data.agreementAccurate ?? false,
    consent_terms: data.agreementReview ?? false,
  };
}

async function nextRevision(applicationId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("brand_application_revisions")
    .select("revision_number")
    .eq("application_id", applicationId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not read application revision: ${error.message}`);
  return (data?.revision_number ?? 0) + 1;
}

export async function saveRebuiltDraft(
  user: User,
  payload: BrandApplicationDraftPayload
): Promise<BrandApplicationRecord> {
  const existing = await getMyApplication(user.id);
  if (existing && !["draft", "changes_requested"].includes(existing.status)) {
    throw new ApplicationServiceError(
      "APPLICATION_NOT_EDITABLE",
      "This application is currently locked for review."
    );
  }

  const snapshot = existing?.applicantAccountSnapshot ?? (await getApplicantAccountSnapshot(user));
  const now = new Date().toISOString();
  const data = {
    ...(existing?.applicationData ?? {}),
    ...payload.applicationData,
  } as BrandApplicationData;

  if (!existing) {
    const { data: row, error } = await supabaseAdmin
      .from("brand_applications")
      .insert({
        ...compatibilityFields(data),
        applicant_user_id: user.id,
        applicant_account_snapshot: snapshot,
        application_data: data,
        schema_version: 2,
        current_step: payload.currentStep,
        last_saved_at: now,
        lock_version: 1,
        status: "draft",
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new ApplicationServiceError(
          "STALE_DRAFT",
          "A newer application already exists. Refresh before continuing."
        );
      }
      throw new Error(`Could not create application draft: ${error.message}`);
    }
    return toBrandApplicationRecord(row as never);
  }

  const expectedVersion = payload.lockVersion ?? existing.lockVersion ?? 0;
  const { data: row, error } = await supabaseAdmin
    .from("brand_applications")
    .update({
      ...compatibilityFields(data),
      application_data: data,
      current_step: payload.currentStep,
      last_saved_at: now,
      lock_version: expectedVersion + 1,
    })
    .eq("id", existing.id)
    .eq("applicant_user_id", user.id)
    .eq("lock_version", expectedVersion)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Could not save application draft: ${error.message}`);
  if (!row) {
    throw new ApplicationServiceError(
      "STALE_DRAFT",
      "This application was updated elsewhere. Refresh to keep the newest version."
    );
  }
  return toBrandApplicationRecord(row as never);
}

export async function submitRebuiltApplication(
  user: User,
  payload: BrandApplicationSubmitPayload
): Promise<BrandApplicationRecord> {
  const existing = await getMyApplication(user.id);
  if (!existing || !["draft", "changes_requested"].includes(existing.status)) {
    throw new ApplicationServiceError("APPLICATION_NOT_EDITABLE", "No editable application was found.");
  }

  const expectedVersion = payload.lockVersion ?? existing.lockVersion ?? 0;
  const nextStatus = existing.status === "changes_requested" ? "resubmitted" : "submitted";
  const now = new Date().toISOString();
  const data = payload.applicationData;
  const { data: row, error } = await supabaseAdmin
    .from("brand_applications")
    .update({
      ...compatibilityFields(data),
      application_data: data,
      current_step: 5,
      last_saved_at: now,
      submitted_at: existing.submittedAt ?? now,
      last_resubmitted_at: nextStatus === "resubmitted" ? now : existing.lastResubmittedAt ?? null,
      lock_version: expectedVersion + 1,
      status: nextStatus,
      requested_sections: nextStatus === "resubmitted" ? [] : existing.requestedSections ?? [],
      requested_fields: nextStatus === "resubmitted" ? [] : existing.requestedFields ?? [],
    })
    .eq("id", existing.id)
    .eq("applicant_user_id", user.id)
    .eq("lock_version", expectedVersion)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Could not submit application: ${error.message}`);
  if (!row) {
    throw new ApplicationServiceError(
      "STALE_DRAFT",
      "A newer saved version exists. Refresh and review it before submitting."
    );
  }

  const revision = await nextRevision(existing.id);
  const { error: revisionError } = await supabaseAdmin.from("brand_application_revisions").insert({
    application_id: existing.id,
    revision_number: revision,
    snapshot: {
      schemaVersion: 2,
      applicationData: data,
      accountSnapshot: existing.applicantAccountSnapshot,
      applicantResponse: payload.applicantResponse || null,
    },
    event_type: nextStatus === "resubmitted" ? "resubmitted" : "submitted",
    created_by: user.id,
  });
  if (revisionError) throw new Error(`Could not preserve submission revision: ${revisionError.message}`);

  if (nextStatus === "resubmitted") {
    await supabaseAdmin
      .from("brand_application_information_requests")
      .update({
        applicant_response: payload.applicantResponse || null,
        responded_at: now,
        resubmitted_at: now,
        status: "responded",
      })
      .eq("application_id", existing.id)
      .eq("status", "open");
  }

  return toBrandApplicationRecord(row as never);
}
