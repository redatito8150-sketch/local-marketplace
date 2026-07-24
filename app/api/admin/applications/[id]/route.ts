import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { getApplicationForAdmin } from "@/lib/data/admin";
import {
  recordStatusHistory,
  computeReapplicationAllowedAt,
} from "@/lib/join/applicationService";
import { isValidStatusTransition } from "@/lib/join/constants";
import type { ApplicationStatus } from "@/types";

// Transitions that must carry a reason (shown to the applicant, so it
// can't be an empty/whitespace string) — everything else is optional.
const REASON_REQUIRED_TRANSITIONS: ApplicationStatus[] = ["rejected", "changes_requested"];

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let body: { status?: unknown; reason?: unknown; adminNotes?: unknown };
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
      update.reapplication_allowed_at = computeReapplicationAllowedAt();
    }
    if (nextStatus === "changes_requested") {
      update.changes_requested_message = reason;
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

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "application",
    entityId: params.id,
    action: "status_change",
    before: { status: application.status },
    after: { status: nextStatus, reason: reason || undefined },
  });

  return NextResponse.json({ id: params.id, status: nextStatus });
}
