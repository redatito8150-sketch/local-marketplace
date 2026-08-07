import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";

type ReturnItemInput = { variantId: string; requestedQty: number; itemNote?: string };

// The reverse of a transfer request — the brand asking for some of its
// already-received local-warehouse stock to be handed back (slow movers,
// ending the partnership on a product, etc). Same request/confirm shape
// as the forward transfer, just against warehouse_transfers.direction =
// 'to_brand' (see request_warehouse_return in the migration).
export async function POST(request: NextRequest) {
  const owner = await requireBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner?.brandId || owner.isImpersonating) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (!owner.isMahalyPartner) return NextResponse.json({ error: "This brand isn't a Mahaly Partner" }, { status: 403 });
  if (!checkRateLimit(`warehouse-return-request:${owner.user.id}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { items?: ReturnItemInput[]; note?: string } | null;
  if (!body?.items?.length) return NextResponse.json({ error: "Select at least one variant to return" }, { status: 400 });
  for (const item of body.items) {
    if (!Number.isInteger(item.requestedQty) || item.requestedQty <= 0) {
      return NextResponse.json({ error: "Quantity must be a whole, positive number" }, { status: 400 });
    }
  }

  const { data: variantRows } = await supabaseAdmin
    .from("product_variants")
    .select("id, sku")
    .in("id", body.items.map((item) => item.variantId));
  const skuByVariantId = new Map((variantRows ?? []).map((row) => [row.id as string, row.sku as string]));

  const operationKey = request.headers.get("idempotency-key") ?? crypto.randomUUID();
  const { data: transferId, error } = await supabaseAdmin.rpc("request_warehouse_return", {
    p_brand_id: owner.brandId,
    p_actor_id: owner.user.id,
    p_items: body.items.map((item) => ({
      variant_id: item.variantId,
      requested_qty: item.requestedQty,
      item_note: item.itemNote ?? null,
    })),
    p_note: body.note ?? null,
    p_operation_key: operationKey,
  } as never);
  if (error) return safeErrorResponse("brand-portal.warehouse.returns.request", error, "Failed to submit the return request", 400);

  const requestedSummary = body.items
    .map((item) => `${skuByVariantId.get(item.variantId) ?? item.variantId}: requested ${item.requestedQty}`)
    .join("\n");

  await logAudit({
    actorId: owner.user.id,
    actorLabel: owner.user.email ?? owner.user.id,
    entityType: "warehouse_transfer",
    entityId: transferId as string,
    action: "create",
    after: { "Return requested": requestedSummary, Note: body.note || undefined },
    brandSlug: owner.brandSlug ?? undefined,
  });
  await notify(
    "warehouse_transfer_requested",
    `Local Warehouse return requested: ${owner.brandName ?? owner.brandSlug ?? ""}`,
    body.note ?? "",
    {
      relatedEntityType: "warehouse_transfer",
      relatedEntityId: transferId as string,
      actorLabel: owner.user.email ?? owner.user.id,
      meta: [{ label: "Items", value: String(body.items.length) }],
    }
  );

  return NextResponse.json({ id: transferId });
}
