import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner?.brandId || owner.accessLevel !== "owner" || owner.isImpersonating) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!owner.isMahalyPartner) {
    return NextResponse.json({ error: "This brand isn't a Zakhnook Partner" }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { reason?: string } | null;
  const reason = body?.reason?.trim() ?? "";
  if (reason.length < 5) {
    return NextResponse.json({ error: "Tell us briefly why you are cancelling this request" }, { status: 400 });
  }

  const { id } = await props.params;
  const { data: result, error } = await supabaseAdmin.rpc("cancel_own_requested_warehouse_document", {
    p_transfer_id: id,
    p_brand_id: owner.brandId,
    p_actor_id: owner.user.id,
    p_note: reason,
  } as never);
  if (error) {
    const message = error.message.includes("WAREHOUSE_DOCUMENT_CANCELLATION_LOCKED")
      ? "This request has already been accepted and can no longer be cancelled"
      : error.message.includes("WAREHOUSE_DOCUMENT_NOT_OWNED")
        ? "This warehouse document does not belong to your brand"
        : "Failed to cancel the warehouse request";
    return safeErrorResponse("brand-portal.warehouse.transfers.cancel", error, message, 409);
  }

  const replayed = Boolean((result as { replayed?: boolean } | null)?.replayed);
  if (!replayed) {
    await Promise.all([
      logAudit({
        actorId: owner.user.id,
        actorLabel: owner.user.email ?? owner.user.id,
        entityType: "warehouse_transfer",
        entityId: id,
        action: "update",
        after: { "Request cancelled": reason },
        brandSlug: owner.brandSlug ?? undefined,
      }),
      notify("warehouse_transfer_cancelled", `Warehouse request cancelled: ${owner.brandName ?? owner.brandSlug ?? ""}`, reason, {
        relatedEntityType: "warehouse_transfer",
        relatedEntityId: id,
        actorLabel: owner.user.email ?? owner.user.id,
      }),
    ]);
  }

  return NextResponse.json({ ok: true, result });
}
