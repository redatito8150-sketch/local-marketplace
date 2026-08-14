import { supabaseAdmin } from "@/lib/supabase/admin";

export interface WarehouseVariantRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  optionLabel: string; // e.g. "Red / M" — joined option value labels, empty for a single-default variant
  quantity: number; // live, storefront-visible stock
  brandStockQuantity: number; // legacy/internal transition balance; not editable in the partner portal
  pendingRequestedQty: number; // incoming quantity tied to nonterminal replenishment documents
  pendingReturnQty: number; // legacy pending returns not yet deducted from live stock
}

export interface WarehouseTransferItemRow {
  id: string;
  variantId: string;
  productName: string;
  sku: string;
  optionLabel: string;
  requestedQty: number;
  receivedOkQty: number | null;
  damagedQty: number | null;
  missingQty: number | null;
  unitCost: number | null;
  itemNote: string | null;
}

export interface WarehouseTransferRow {
  id: string;
  brandId: string;
  brandName: string;
  direction: "to_local" | "to_brand";
  status: "draft" | "pending" | "submitted" | "approved" | "in_transit" | "receiving" | "partially_received" | "received" | "rejected" | "cancelled";
  requestedAt: string;
  requestedByEmail: string | null;
  brandNote: string | null;
  decidedAt: string | null;
  decidedByEmail: string | null;
  receivingNote: string | null;
  items: WarehouseTransferItemRow[];
}

function joinOptionLabel(values: { label: string }[] | null | undefined): string {
  return (values ?? []).map((v) => v.label).join(" / ");
}

// Every non-archived variant for a partner brand, with its own declared
// stock, live storefront quantity, and how much of that declared stock is
// already tied up in an open (not-yet-decided) transfer request — the
// Local Warehouse page's "what can I still request" number.
export async function getBrandWarehouseVariants(brandId: string): Promise<WarehouseVariantRow[]> {
  const { data: variantRows, error } = await supabaseAdmin
    .from("product_variants")
    .select("id, product_id, sku, quantity, brand_stock_quantity, products!inner(id, name, brand_id)")
    .eq("products.brand_id", brandId)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getBrandWarehouseVariants(${brandId}) failed: ${error.message}`);

  const variants = variantRows ?? [];
  if (variants.length === 0) return [];
  const variantIds = variants.map((v) => v.id as string);

  const [{ data: valueRows }, { data: pendingRows }] = await Promise.all([
    supabaseAdmin
      .from("product_variant_values")
      .select("variant_id, option_values(label)")
      .in("variant_id", variantIds),
    supabaseAdmin
      .from("warehouse_transfer_items")
      .select("variant_id, requested_qty, received_ok_qty, warehouse_transfers!inner(status, direction, stock_reserved_at)")
      .in("variant_id", variantIds)
      .in("warehouse_transfers.status", ["pending", "submitted", "approved", "in_transit", "receiving", "partially_received"])
      .is("received_ok_qty", null),
  ]);

  const labelsByVariant = new Map<string, { label: string }[]>();
  for (const row of valueRows ?? []) {
    const list = labelsByVariant.get(row.variant_id as string) ?? [];
    const value = row.option_values as unknown as { label: string } | null;
    if (value) list.push(value);
    labelsByVariant.set(row.variant_id as string, list);
  }

  const pendingByVariant = new Map<string, number>();
  const pendingReturnByVariant = new Map<string, number>();
  for (const row of pendingRows ?? []) {
    const key = row.variant_id as string;
    const transfer = row.warehouse_transfers as unknown as {
      direction: "to_local" | "to_brand";
      stock_reserved_at: string | null;
    };
    // Reserved returns have already been deducted from sellable quantity.
    // Only legacy unreserved returns still need subtracting in the UI.
    if (transfer.direction === "to_brand" && transfer.stock_reserved_at) continue;
    const map = transfer.direction === "to_brand" ? pendingReturnByVariant : pendingByVariant;
    map.set(key, (map.get(key) ?? 0) + (row.requested_qty as number));
  }

  return variants.map((v) => {
    const product = v.products as unknown as { id: string; name: string };
    return {
      variantId: v.id as string,
      productId: product.id,
      productName: product.name,
      sku: v.sku as string,
      optionLabel: joinOptionLabel(labelsByVariant.get(v.id as string)),
      quantity: v.quantity as number,
      brandStockQuantity: v.brand_stock_quantity as number,
      pendingRequestedQty: pendingByVariant.get(v.id as string) ?? 0,
      pendingReturnQty: pendingReturnByVariant.get(v.id as string) ?? 0,
    };
  });
}

async function attachItems(transfers: { id: string }[]): Promise<Map<string, WarehouseTransferItemRow[]>> {
  const itemsByTransfer = new Map<string, WarehouseTransferItemRow[]>();
  if (transfers.length === 0) return itemsByTransfer;

  const { data: itemRows } = await supabaseAdmin
    .from("warehouse_transfer_items")
    .select("id, transfer_id, variant_id, requested_qty, received_ok_qty, damaged_qty, missing_qty, unit_cost, item_note, product_variants(sku, products(name))")
    .in("transfer_id", transfers.map((t) => t.id));

  const variantIds = (itemRows ?? []).map((row) => row.variant_id as string);
  const { data: valueRows } = variantIds.length
    ? await supabaseAdmin.from("product_variant_values").select("variant_id, option_values(label)").in("variant_id", variantIds)
    : { data: [] };
  const labelsByVariant = new Map<string, { label: string }[]>();
  for (const row of valueRows ?? []) {
    const list = labelsByVariant.get(row.variant_id as string) ?? [];
    const value = row.option_values as unknown as { label: string } | null;
    if (value) list.push(value);
    labelsByVariant.set(row.variant_id as string, list);
  }

  for (const row of itemRows ?? []) {
    const variant = row.product_variants as unknown as { sku: string; products: { name: string } | null } | null;
    const list = itemsByTransfer.get(row.transfer_id as string) ?? [];
    list.push({
      id: row.id as string,
      variantId: row.variant_id as string,
      productName: variant?.products?.name ?? "",
      sku: variant?.sku ?? "",
      optionLabel: joinOptionLabel(labelsByVariant.get(row.variant_id as string)),
      requestedQty: row.requested_qty as number,
      receivedOkQty: row.received_ok_qty as number | null,
      damagedQty: row.damaged_qty as number | null,
      missingQty: row.missing_qty as number | null,
      unitCost: row.unit_cost as number | null,
      itemNote: row.item_note as string | null,
    });
    itemsByTransfer.set(row.transfer_id as string, list);
  }
  return itemsByTransfer;
}

async function emailFor(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

export async function getBrandWarehouseTransfers(brandId: string): Promise<WarehouseTransferRow[]> {
  const { data: transferRows, error } = await supabaseAdmin
    .from("warehouse_transfers")
    .select("id, brand_id, status, direction, requested_at, requested_by, brand_note, decided_at, decided_by, receiving_note, brands(name)")
    .eq("brand_id", brandId)
    .order("requested_at", { ascending: false });
  if (error) throw new Error(`getBrandWarehouseTransfers(${brandId}) failed: ${error.message}`);

  const transfers = transferRows ?? [];
  const itemsByTransfer = await attachItems(transfers);
  return transfers.map((t) => ({
    id: t.id as string,
    brandId: t.brand_id as string,
    brandName: (t.brands as unknown as { name: string } | null)?.name ?? "",
    direction: t.direction as WarehouseTransferRow["direction"],
    status: t.status as WarehouseTransferRow["status"],
    requestedAt: t.requested_at as string,
    requestedByEmail: null,
    brandNote: t.brand_note as string | null,
    decidedAt: t.decided_at as string | null,
    decidedByEmail: null,
    receivingNote: t.receiving_note as string | null,
    items: itemsByTransfer.get(t.id as string) ?? [],
  }));
}

export async function getAllWarehouseTransfers(status?: "pending" | "received" | "rejected"): Promise<WarehouseTransferRow[]> {
  let query = supabaseAdmin
    .from("warehouse_transfers")
    .select("id, brand_id, status, direction, requested_at, requested_by, brand_note, decided_at, decided_by, receiving_note, brands(name)")
    .order("requested_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data: transferRows, error } = await query;
  if (error) throw new Error(`getAllWarehouseTransfers() failed: ${error.message}`);

  const transfers = transferRows ?? [];
  const itemsByTransfer = await attachItems(transfers);
  const emails = new Map<string, string | null>();
  for (const t of transfers) {
    for (const id of [t.requested_by, t.decided_by] as (string | null)[]) {
      if (id && !emails.has(id)) emails.set(id, await emailFor(id));
    }
  }

  return transfers.map((t) => ({
    id: t.id as string,
    brandId: t.brand_id as string,
    brandName: (t.brands as unknown as { name: string } | null)?.name ?? "",
    direction: t.direction as WarehouseTransferRow["direction"],
    status: t.status as WarehouseTransferRow["status"],
    requestedAt: t.requested_at as string,
    requestedByEmail: (t.requested_by as string | null) ? emails.get(t.requested_by as string) ?? null : null,
    brandNote: t.brand_note as string | null,
    decidedAt: t.decided_at as string | null,
    decidedByEmail: (t.decided_by as string | null) ? emails.get(t.decided_by as string) ?? null : null,
    receivingNote: t.receiving_note as string | null,
    items: itemsByTransfer.get(t.id as string) ?? [],
  }));
}

export async function getWarehouseTransferById(id: string): Promise<WarehouseTransferRow | null> {
  const { data: t, error } = await supabaseAdmin
    .from("warehouse_transfers")
    .select("id, brand_id, status, direction, requested_at, requested_by, brand_note, decided_at, decided_by, receiving_note, brands(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getWarehouseTransferById(${id}) failed: ${error.message}`);
  if (!t) return null;

  const itemsByTransfer = await attachItems([t]);
  return {
    id: t.id as string,
    brandId: t.brand_id as string,
    brandName: (t.brands as unknown as { name: string } | null)?.name ?? "",
    direction: t.direction as WarehouseTransferRow["direction"],
    status: t.status as WarehouseTransferRow["status"],
    requestedAt: t.requested_at as string,
    requestedByEmail: await emailFor(t.requested_by as string | null),
    brandNote: t.brand_note as string | null,
    decidedAt: t.decided_at as string | null,
    decidedByEmail: await emailFor(t.decided_by as string | null),
    receivingNote: t.receiving_note as string | null,
    items: itemsByTransfer.get(t.id as string) ?? [],
  };
}
