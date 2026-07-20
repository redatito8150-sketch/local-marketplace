import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { APPLICATION_STATUSES } from "@/lib/admin/statuses";
import { logAudit } from "@/lib/auditLog";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const status = body.status;

  if (!APPLICATION_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("brand_applications")
    .select("status")
    .eq("id", params.id)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("brand_applications")
    .update({ status })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json(
      { error: `Failed to update application: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "application",
    entityId: params.id,
    action: "status_change",
    before: existing,
    after: { status },
  });

  return NextResponse.json({ id: params.id, status });
}
