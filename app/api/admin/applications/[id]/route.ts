import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser, requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { notifyUser } from "@/lib/notify";
import { getApplicationForAdmin } from "@/lib/data/admin";
import { deleteApplicationTransactionally } from "@/lib/admin/applicationDeletion";
import {
  recordStatusHistory,
  computeReapplicationAllowedAt,
} from "@/lib/join/applicationService";
import { isValidStatusTransition } from "@/lib/join/constants";
import { sendEmail } from "@/lib/email/sendEmail";
import {
  applicationApprovedEmail,
  applicationChangesRequestedEmail,
  applicationRejectedEmail,
  applicationUnderReviewEmail,
} from "@/lib/email/templates/brandApplication";
import type { ApplicationStatus, BrandApplicationRecord } from "@/types";

function applicantEmailFor(
  status: ApplicationStatus,
  application: BrandApplicationRecord,
  reason: string
): { subject: string; html: string } | null {
  switch (status) {
    case "under_review":
      return applicationUnderReviewEmail(application);
    case "changes_requested":
      return applicationChangesRequestedEmail(application, reason);
    case "approved":
    case "approved_pending_creation":
      return applicationApprovedEmail(application);
    case "rejected":
      return applicationRejectedEmail(application, reason);
    default:
      return null;
  }
}

// In-site notification counterpart to applicantEmailFor() above — a
// separate, shorter text for the bell/inbox, not the email content
// itself. Fires for the same statuses the email already covers.
function applicantNotificationFor(
  status: ApplicationStatus,
  reason: string
): { title: string; body: string } | null {
  switch (status) {
    case "under_review":
      return { title: "Your brand application is under review", body: "" };
    case "changes_requested":
      return { title: "We need more information on your brand application", body: reason };
    case "approved":
    case "approved_pending_creation":
      return { title: "Your brand application was approved", body: "" };
    case "rejected":
      return { title: "Your brand application was not approved", body: reason };
    default:
      return null;
  }
}

// Transitions that must carry a reason (shown to the applicant, so it
// can't be an empty/whitespace string) — everything else is optional.
const REASON_REQUIRED_TRANSITIONS: ApplicationStatus[] = ["rejected", "changes_requested"];

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let body: {
    status?: unknown;
    reason?: unknown;
    adminNotes?: unknown;
    requestedSections?: unknown;
    requestedFields?: unknown;
    responseDeadline?: unknown;
    applicantMessage?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const nextStatus = body.status;
  if (typeof nextStatus !== "string") {
    return NextResponse.json({ error: "Missing status" }, { status: 400 });
  }

  const application = await getApplicationForAdmin(params.id);
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const isSameStatusNotesUpdate = nextStatus === application.status && body.adminNotes !== undefined;
  if (!isSameStatusNotesUpdate && !isValidStatusTransition(application.status, nextStatus as ApplicationStatus)) {
    return NextResponse.json(
      { error: `Cannot move from "${application.status}" to "${nextStatus}".` },
      { status: 400 }
    );
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (
    REASON_REQUIRED_TRANSITIONS.includes(nextStatus as ApplicationStatus) &&
    !reason &&
    nextStatus !== application.status
  ) {
    return NextResponse.json(
      { error: "A reason is required for this action." },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = { status: nextStatus };
  if (body.adminNotes !== undefined && typeof body.adminNotes === "string") {
    update.admin_notes = body.adminNotes;
  }
  if (nextStatus !== application.status) {
    update.reviewed_at = new Date().toISOString();
    update.reviewed_by = admin.id;
    if (nextStatus === "rejected") {
      update.rejection_reason = reason;
      update.applicant_visible_message =
        typeof body.applicantMessage === "string" && body.applicantMessage.trim()
          ? body.applicantMessage.trim()
          : reason;
      update.reapplication_allowed_at = computeReapplicationAllowedAt();
    }
    if (nextStatus === "changes_requested") {
      const requestedSections = Array.isArray(body.requestedSections)
        ? body.requestedSections.filter((value): value is string => typeof value === "string")
        : [];
      const requestedFields = Array.isArray(body.requestedFields)
        ? body.requestedFields.filter((value): value is string => typeof value === "string")
        : [];
      update.changes_requested_message = reason;
      update.applicant_visible_message = reason;
      update.requested_sections = requestedSections;
      update.requested_fields = requestedFields;
      update.information_response_deadline =
        typeof body.responseDeadline === "string" && body.responseDeadline
          ? body.responseDeadline
          : null;
    }
  }

  const { error } = await supabaseAdmin
    .from("brand_applications")
    .update(update)
    .eq("id", params.id);

  if (error) {
    return safeErrorResponse("admin.applications.patch", error);
  }

  if (nextStatus !== application.status) {
    await recordStatusHistory(
      params.id,
      application.status,
      nextStatus as ApplicationStatus,
      admin.id,
      reason || null
    );
  }

  if (nextStatus === "changes_requested" && nextStatus !== application.status) {
    const requestedSections = Array.isArray(body.requestedSections)
      ? body.requestedSections.filter((value): value is string => typeof value === "string")
      : [];
    const requestedFields = Array.isArray(body.requestedFields)
      ? body.requestedFields.filter((value): value is string => typeof value === "string")
      : [];
    const { error: requestError } = await supabaseAdmin
      .from("brand_application_information_requests")
      .insert({
        application_id: application.id,
        requested_sections: requestedSections,
        requested_fields: requestedFields,
        message: reason,
        response_deadline:
          typeof body.responseDeadline === "string" && body.responseDeadline
            ? body.responseDeadline
            : null,
        requested_by: admin.id,
      });
    if (requestError) return safeErrorResponse("admin.applications.information-request", requestError);

    const { data: latestRevision } = await supabaseAdmin
      .from("brand_application_revisions")
      .select("revision_number")
      .eq("application_id", application.id)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    await supabaseAdmin.from("brand_application_revisions").insert({
      application_id: application.id,
      revision_number: (latestRevision?.revision_number ?? 0) + 1,
      snapshot: {
        applicationData: application.applicationData ?? {},
        requestedSections,
        requestedFields,
        message: reason,
      },
      event_type: "information_requested",
      created_by: admin.id,
    });
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "application",
    entityId: params.id,
    action: "status_change",
    before: { status: application.status },
    after: { status: nextStatus, reason: reason || undefined },
  });

  if (nextStatus !== application.status) {
    const email = applicantEmailFor(nextStatus as ApplicationStatus, application, reason);
    if (email) {
      await sendEmail({ to: application.email, ...email });
    }
    if (application.applicantUserId) {
      const inSite = applicantNotificationFor(nextStatus as ApplicationStatus, reason);
      if (inSite) {
        await notifyUser(
          application.applicantUserId,
          `brand_application_${nextStatus}`,
          inSite.title,
          inSite.body,
          { relatedEntityType: "application", relatedEntityId: params.id }
        );
      }
    }
  }

  return NextResponse.json({ id: params.id, status: nextStatus });
}

// Deleting an application is irreversible (unlike status transitions, which
// can be corrected with another PATCH), so this requires the top staff rank
// rather than the plain requireAdminUser() the PATCH handler above uses.
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let body: { reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "A reason is required to delete an application." }, { status: 400 });
  }

  const application = await getApplicationForAdmin(params.id);
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Audit finding APP-01 (docs/audits/2026-08-20-production-security-
  // correctness-reliability-audit-en.md): every child table, the parent
  // row, and queueing each document's Storage path for durable cleanup now
  // happen inside one Postgres transaction, instead of five unguarded
  // sequential .delete() calls that could leave a partially destroyed
  // application and always orphaned the private legal documents in
  // Storage.
  let result;
  try {
    result = await deleteApplicationTransactionally(params.id, staff.user.id, reason);
  } catch (error) {
    return safeErrorResponse("admin.applications.delete", { message: error instanceof Error ? error.message : "unknown error" });
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "APPLICATION_NOT_FOUND" ? 404 : 409 });
  }

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "application",
    entityId: params.id,
    action: "delete",
    before: application,
    after: { reason, mediaJobsQueued: result.mediaJobsQueued },
  });

  return NextResponse.json({ id: params.id, deleted: true });
}
