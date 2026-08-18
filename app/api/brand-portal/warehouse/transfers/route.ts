import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { replenishmentErrorResponse } from "@/lib/warehouse/replenishmentErrorResponse";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { parseOrderIdempotencyKey } from "@/lib/orders/idempotency";

type TransferItemInput = { variantId: string; requestedQty: number; unitCost?: number; itemNote?: string };

// "اذن صرف مخزن" — a Zakhnook Partner brand asking Zakhnook's warehouse to
// take physical custody of some of its own declared stock. Nothing on the
// storefront changes yet (product_variants.quantity is untouched) — this
// only creates the requested record + notifies the admin bell. Zakhnook
// accepts it into the non-stock "awaiting arrival" stage first; the actual
// inventory effect happens only once a warehouse receiver confirms receipt (see
// app/api/admin/warehouse/transfers/[id]/receive/route.ts).
export async function POST(request: NextRequest) {
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner?.brandId || owner.isImpersonating || owner.accessLevel !== "owner") return NextResponse.json({ error: "Only a brand owner can create a warehouse request" }, { status: 403 });
  if (!owner.isMahalyPartner) return NextResponse.json({ error: "This brand isn't a Zakhnook Partner" }, { status: 403 });
  if (!checkRateLimit(`warehouse-transfer-request:${owner.user.id}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { items?: TransferItemInput[]; note?: string; expectedArrivalAt?: string } | null;
  if (!body?.items?.length) return NextResponse.json({ error: "Select at least one variant to transfer" }, { status: 400 });
  const expectedArrivalAt = body.expectedArrivalAt ? new Date(body.expectedArrivalAt) : null;
  if (!expectedArrivalAt || Number.isNaN(expectedArrivalAt.getTime()) || expectedArrivalAt.getTime() < Date.now() - 5 * 60 * 1000) {
    return NextResponse.json({ error: "Choose a valid future arrival date and time" }, { status: 400 });
  }
  if (new Set(body.items.map((item) => item.variantId)).size !== body.items.length) {
    return NextResponse.json({ error: "Each variant can appear only once" }, { status: 400 });
  }
  for (const item of body.items) {
    if (!Number.isInteger(item.requestedQty) || item.requestedQty <= 0) {
      return NextResponse.json({ error: "Quantity must be a whole, positive number" }, { status: 400 });
    }
    if (item.unitCost != null && (!Number.isFinite(item.unitCost) || item.unitCost < 0)) {
      return NextResponse.json({ error: "Unit cost cannot be negative" }, { status: 400 });
    }
  }

  const { data: variantRows } = await supabaseAdmin
    .from("product_variants")
    .select("id, sku")
    .in("id", body.items.map((item) => item.variantId));
  const skuByVariantId = new Map((variantRows ?? []).map((row) => [row.id as string, row.sku as string]));

  const operationKey = parseOrderIdempotencyKey(request.headers.get("idempotency-key"));
  if (!operationKey) {
    return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
  }
  const { data: transferId, error } = await supabaseAdmin.rpc("request_warehouse_transfer_with_arrival", {
    p_brand_id: owner.brandId,
    p_actor_id: owner.user.id,
    p_items: body.items.map((item) => ({
      variant_id: item.variantId,
      requested_qty: item.requestedQty,
      unit_cost: item.unitCost ?? null,
      item_note: item.itemNote ?? null,
    })),
    p_note: body.note ?? null,
    p_operation_key: operationKey,
    p_expected_arrival_at: expectedArrivalAt.toISOString(),
  } as never);
  if (error) return replenishmentErrorResponse("brand-portal.warehouse.transfers.request", error);

  const requestedSummary = body.items
    .map((item) => `${skuByVariantId.get(item.variantId) ?? item.variantId}: requested ${item.requestedQty}`)
    .join("\n");

  await logAudit({
    actorId: owner.user.id,
    actorLabel: owner.user.email ?? owner.user.id,
    entityType: "warehouse_transfer",
    entityId: transferId as string,
    action: "create",
    after: { "Transfer requested": requestedSummary, "Expected arrival": expectedArrivalAt.toISOString(), Note: body.note || undefined },
    brandSlug: owner.brandSlug ?? undefined,
  });
  // Deliberately NOT resolvable (no auditLogId) — Approve/Revert is the
  // Instant-Publish semantics for a change that already went live and can
  // be undone. A request still has no inventory effect at this stage.
  await notify(
    "warehouse_transfer_requested",
    `Local Warehouse transfer requested: ${owner.brandName ?? owner.brandSlug ?? ""}`,
    body.note ?? "",
    {
      relatedEntityType: "warehouse_transfer",
      relatedEntityId: transferId as string,
      actorLabel: owner.user.email ?? owner.user.id,
      meta: [
        { label: "Items", value: String(body.items.length) },
        { label: "Expected arrival", value: expectedArrivalAt.toLocaleString("en-GB", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" }) },
      ],
    }
  );

  return NextResponse.json({ id: transferId });
}
