import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner?.brandId || owner.accessLevel !== "owner" || owner.isImpersonating) {
    return NextResponse.json({ error: "Only the real Brand Owner can confirm this delivery" }, { status: 403 });
  }
  if (!owner.isMahalyPartner) return NextResponse.json({ error: "This brand isn't a Zakhnook Partner" }, { status: 403 });

  const { id } = await props.params;
  const body = await request.json().catch(() => null) as { arrived?: boolean; note?: string } | null;
  if (body?.arrived !== true) return NextResponse.json({ error: "Confirm that the shipment arrived before closing this return" }, { status: 400 });
  const note = body.note?.trim() || null;
  if (note && note.length > 2000) return NextResponse.json({ error: "The delivery note must be 2,000 characters or fewer" }, { status: 400 });

  const { data: transfer, error: transferError } = await supabaseAdmin
    .from("warehouse_transfers")
    .select("id, brand_id, direction, status, document_number")
    .eq("id", id)
    .maybeSingle();
  if (transferError) return safeErrorResponse("brand-portal.warehouse.returns.confirm-transfer", transferError, "Failed to load this return");
  if (!transfer || transfer.brand_id !== owner.brandId || transfer.direction !== "to_brand") {
    return NextResponse.json({ error: "This Stock Return Note does not belong to your brand" }, { status: 404 });
  }
  if (transfer.status !== "in_transit") {
    return NextResponse.json({ error: "This return is not awaiting brand delivery confirmation" }, { status: 409 });
  }

  const { data: expectedLines, error: linesError } = await supabaseAdmin
    .from("warehouse_transfer_items")
    .select("id, requested_qty, dispatched_qty, variant_id, product_variants(sku)")
    .eq("transfer_id", id);
  if (linesError) return safeErrorResponse("brand-portal.warehouse.returns.confirm-lines", linesError, "Failed to load the Document lines");
  if (!(expectedLines ?? []).length || (expectedLines ?? []).some((line) => line.dispatched_qty == null)) {
    return NextResponse.json({ error: "Zakhnook must dispatch every Document line before the brand can confirm arrival" }, { status: 409 });
  }

  const { data: result, error } = await supabaseAdmin.rpc("confirm_warehouse_return_received", {
    p_transfer_id: id,
    p_brand_id: owner.brandId,
    p_actor_id: owner.user.id,
    p_note: note,
  } as never);
  if (error) return safeErrorResponse("brand-portal.warehouse.returns.confirm", error, "Failed to confirm this delivery", 400);

  const lineSummary = (expectedLines ?? []).map((line) => {
    const variant = line?.product_variants as unknown as { sku: string } | null;
    return `${variant?.sku ?? line?.variant_id ?? line.id}: ${line.dispatched_qty} expected units`;
  }).join("\n");

  const adminNotifications = [
    notify(
      "warehouse_transfer_received",
      `${transfer.document_number ?? "Stock Return Note"} received by ${owner.brandName ?? owner.brandSlug ?? "brand"}`,
      ["The Brand Owner confirmed that the shipment arrived. The return is now Returned to brand.", lineSummary, note].filter(Boolean).join("\n\n"),
      { relatedEntityType: "warehouse_transfer", relatedEntityId: id, actorLabel: owner.user.email ?? owner.user.id },
    ),
  ];
  if (note) {
    adminNotifications.push(notify(
      "warehouse_delivery_note_review",
      `${transfer.document_number ?? "Stock Return Note"} has a Brand Owner note · Needs review`,
      note,
      {
        relatedEntityType: "warehouse_transfer",
        relatedEntityId: id,
        actorLabel: owner.user.email ?? owner.user.id,
        detailLabel: "Brand delivery note",
      },
    ));
  }

  await Promise.all([
    logAudit({
      actorId: owner.user.id,
      actorLabel: owner.user.email ?? owner.user.id,
      entityType: "warehouse_transfer",
      entityId: id,
      action: "status_change",
      after: {
        Status: "Returned to brand",
        "Brand confirmed shipment arrival": lineSummary,
        Note: note || undefined,
      },
      brandSlug: owner.brandSlug ?? undefined,
    }),
    ...adminNotifications,
  ]);

  return NextResponse.json({ ok: true, result });
}
