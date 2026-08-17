import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildColorImageLookup, resolveVariantImage } from "@/lib/orders/variantImage";

export type WarehouseTransferStatus =
  | "draft"
  | "pending"
  | "submitted"
  | "approved"
  | "in_transit"
  | "receiving"
  | "partially_received"
  | "received"
  | "rejected"
  | "cancelled";

// Cheap count-only query for nav badges (sidebar + workspace nav) — avoids
// the full transfer+items fetch that getAllWarehouseTransfers does.
export async function getPendingWarehouseTransferCount(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("warehouse_transfers")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw new Error(`getPendingWarehouseTransferCount failed: ${error.message}`);
  return count ?? 0;
}

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
  productImage: string | null;
  sku: string;
  optionLabel: string;
  requestedQty: number;
  receivedOkQty: number | null;
  damagedQty: number | null;
  missingQty: number | null;
  unitCost: number | null;
  itemNote: string | null;
  returnedQty: number | null;
  quarantineResolvedAt: string | null;
  quarantineResolution: "written_off" | "returned_to_brand" | "restored_to_sellable" | null;
}

export interface WarehouseReceiptLineRow {
  id: string;
  expectedTransferItemId: string;
  expectedVariantId: string;
  actualVariantId: string | null;
  expectedQty: number;
  actualGoodQty: number;
  actualDamagedQty: number;
  unidentifiedQty: number;
  expectedMissingQty: number;
  actualExcessQty: number;
  outcome: "exact" | "short" | "excess" | "damaged" | "substitution" | "unidentified" | "mixed";
  settlementStatus: "clean" | "open" | "partially_settled" | "settled" | "corrected";
  unidentifiedSku: string | null;
  itemNote: string | null;
}

export interface WarehouseReceiptRow {
  id: string;
  receiptNumber: string;
  status: "posted" | "partially_reversed" | "reversed";
  settlementStatus: "clean" | "open_discrepancy" | "partially_settled" | "settled" | "corrected";
  note: string | null;
  postedAt: string;
  lines: WarehouseReceiptLineRow[];
}

export interface WarehouseCorrectionLineRow {
  id: string;
  action: "reclassify" | "adjust_in" | "adjust_out" | "restore_to_sellable" | "return_to_brand" | "write_off" | "accept_discrepancy";
  fromVariantId: string | null;
  toVariantId: string | null;
  sourceReceiptLineId: string | null;
  sourceBucket: "damaged" | "missing" | "substitution" | "excess" | "unidentified" | null;
  quantity: number;
  note: string | null;
}

export interface WarehouseCorrectionRow {
  id: string;
  correctionNumber: string;
  correctionType: "reclassification" | "quantity_adjustment" | "missing_recovery" | "condition_resolution" | "reversal";
  status: "pending_approval" | "posted" | "rejected" | "reversed";
  reasonCode: string;
  note: string;
  requestedAt: string;
  approvedAt: string | null;
  postedAt: string | null;
  rejectionNote: string | null;
  reversesCorrectionId: string | null;
  lines: WarehouseCorrectionLineRow[];
}

export interface WarehouseReceiptVariantOption {
  variantId: string;
  productName: string;
  sku: string;
  optionLabel: string;
}

export interface WarehouseTransferRow {
  id: string;
  brandId: string;
  brandName: string;
  brandSlug: string;
  brandLogoImage: string | null;
  direction: "to_local" | "to_brand";
  status: WarehouseTransferStatus;
  documentNumber: string | null;
  documentType: "stock_transfer_note" | "stock_return_note" | null;
  hasDiscrepancy: boolean;
  reconciliationStatus: "unreviewed" | "clean" | "open_discrepancy" | "partially_settled" | "settled" | "corrected";
  requestedAt: string;
  requestedByEmail: string | null;
  brandNote: string | null;
  decidedAt: string | null;
  decidedByEmail: string | null;
  receivingNote: string | null;
  approvedAt: string | null;
  approvedByEmail: string | null;
  updatedAt: string;
  items: WarehouseTransferItemRow[];
  receipts: WarehouseReceiptRow[];
  corrections: WarehouseCorrectionRow[];
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
    .select("id, transfer_id, variant_id, requested_qty, received_ok_qty, damaged_qty, missing_qty, unit_cost, item_note, returned_qty, quarantine_resolved_at, quarantine_resolution, product_variants(sku, product_id, products(name, image))")
    .in("transfer_id", transfers.map((t) => t.id));

  const variantIds = (itemRows ?? []).map((row) => row.variant_id as string);
  const productIds = [...new Set((itemRows ?? []).map((row) => {
    const variant = row.product_variants as unknown as { product_id: string } | null;
    return variant?.product_id;
  }).filter((id): id is string => Boolean(id)))];
  const [valuesResult, mediaResult] = await Promise.all([
    variantIds.length
      ? supabaseAdmin
        .from("product_variant_values")
        .select("variant_id, option_value_id, option_values(id, label, option_types(name))")
        .in("variant_id", variantIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabaseAdmin
        .from("product_media")
        .select("product_id, storage_reference, color_option_value_id")
        .in("product_id", productIds)
        .eq("is_archived", false)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (valuesResult.error) throw new Error(`attachItems option values failed: ${valuesResult.error.message}`);
  if (mediaResult.error) throw new Error(`attachItems media failed: ${mediaResult.error.message}`);
  const optionsByVariant = new Map<string, { optionTypeId: string; optionTypeName: string; optionValueId: string; label: string }[]>();
  for (const row of valuesResult.data ?? []) {
    const list = optionsByVariant.get(row.variant_id as string) ?? [];
    const value = row.option_values as unknown as { id: string; label: string; option_types: { name: string } | null } | null;
    if (value) {
      list.push({
        optionTypeId: value.option_types?.name ?? "",
        optionTypeName: value.option_types?.name ?? "",
        optionValueId: (row.option_value_id as string) || value.id,
        label: value.label,
      });
    }
    optionsByVariant.set(row.variant_id as string, list);
  }
  const colorImages = buildColorImageLookup(mediaResult.data ?? []);

  for (const row of itemRows ?? []) {
    const variant = row.product_variants as unknown as { sku: string; product_id: string; products: { name: string; image: string | null } | null } | null;
    const optionValues = optionsByVariant.get(row.variant_id as string) ?? [];
    const list = itemsByTransfer.get(row.transfer_id as string) ?? [];
    list.push({
      id: row.id as string,
      variantId: row.variant_id as string,
      productName: variant?.products?.name ?? "",
      productImage: variant ? resolveVariantImage(variant.product_id, { optionValues }, colorImages, variant.products?.image) || null : null,
      sku: variant?.sku ?? "",
      optionLabel: joinOptionLabel(optionValues),
      requestedQty: row.requested_qty as number,
      receivedOkQty: row.received_ok_qty as number | null,
      damagedQty: row.damaged_qty as number | null,
      missingQty: row.missing_qty as number | null,
      unitCost: row.unit_cost as number | null,
      itemNote: row.item_note as string | null,
      returnedQty: row.returned_qty as number | null,
      quarantineResolvedAt: row.quarantine_resolved_at as string | null,
      quarantineResolution: row.quarantine_resolution as WarehouseTransferItemRow["quarantineResolution"],
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
    .select("id, brand_id, status, direction, document_number, document_type, has_discrepancy, requested_at, requested_by, brand_note, approved_at, approved_by, decided_at, decided_by, receiving_note, updated_at, brands(name, slug, logo_image)")
    .eq("brand_id", brandId)
    .order("requested_at", { ascending: false });
  if (error) throw new Error(`getBrandWarehouseTransfers(${brandId}) failed: ${error.message}`);

  const transfers = transferRows ?? [];
  const itemsByTransfer = await attachItems(transfers);
  return transfers.map((t) => ({
    id: t.id as string,
    brandId: t.brand_id as string,
    brandName: (t.brands as unknown as { name: string; slug: string; logo_image: string | null } | null)?.name ?? "",
    brandSlug: (t.brands as unknown as { name: string; slug: string; logo_image: string | null } | null)?.slug ?? "",
    brandLogoImage: (t.brands as unknown as { logo_image: string | null } | null)?.logo_image ?? null,
    direction: t.direction as WarehouseTransferRow["direction"],
    status: t.status as WarehouseTransferRow["status"],
    documentNumber: t.document_number as string | null,
    documentType: t.document_type as WarehouseTransferRow["documentType"],
    hasDiscrepancy: Boolean(t.has_discrepancy),
    reconciliationStatus: t.has_discrepancy ? "open_discrepancy" : t.status === "received" ? "clean" : "unreviewed",
    requestedAt: t.requested_at as string,
    requestedByEmail: null,
    brandNote: t.brand_note as string | null,
    decidedAt: t.decided_at as string | null,
    decidedByEmail: null,
    receivingNote: t.receiving_note as string | null,
    approvedAt: t.approved_at as string | null,
    approvedByEmail: null,
    updatedAt: t.updated_at as string,
    items: itemsByTransfer.get(t.id as string) ?? [],
    receipts: [],
    corrections: [],
  }));
}

async function getWarehouseDocumentHistory(transferId: string): Promise<{
  receipts: WarehouseReceiptRow[];
  corrections: WarehouseCorrectionRow[];
}> {
  const [{ data: receiptRows, error: receiptError }, { data: correctionRows, error: correctionError }] = await Promise.all([
    supabaseAdmin
      .from("warehouse_receipts")
      .select("id, receipt_number, status, settlement_status, note, posted_at, warehouse_receipt_lines(id, expected_transfer_item_id, expected_variant_id, actual_variant_id, expected_qty, actual_good_qty, actual_damaged_qty, unidentified_qty, expected_missing_qty, actual_excess_qty, outcome, settlement_status, unidentified_sku, item_note)")
      .eq("transfer_id", transferId)
      .order("posted_at", { ascending: false }),
    supabaseAdmin
      .from("warehouse_corrections")
      .select("id, correction_number, correction_type, status, reason_code, note, requested_at, approved_at, posted_at, rejection_note, reverses_correction_id, warehouse_correction_lines(id, action, from_variant_id, to_variant_id, source_receipt_line_id, source_bucket, quantity, note)")
      .eq("transfer_id", transferId)
      .order("requested_at", { ascending: false }),
  ]);

  // The migration may not have been applied to a developer database yet.
  // Keep the existing warehouse detail page usable while the branch is being
  // reviewed; once applied, real history is returned immediately.
  const missingSchemaCodes = new Set(["42P01", "PGRST200", "PGRST204", "PGRST205"]);
  if ((receiptError?.code && missingSchemaCodes.has(receiptError.code)) || (correctionError?.code && missingSchemaCodes.has(correctionError.code))) {
    return { receipts: [], corrections: [] };
  }
  if (receiptError) throw new Error(`getWarehouseDocumentHistory(${transferId}) receipts failed: ${receiptError.message}`);
  if (correctionError) throw new Error(`getWarehouseDocumentHistory(${transferId}) corrections failed: ${correctionError.message}`);

  const receipts: WarehouseReceiptRow[] = (receiptRows ?? []).map((row) => ({
    id: row.id as string,
    receiptNumber: row.receipt_number as string,
    status: row.status as WarehouseReceiptRow["status"],
    settlementStatus: row.settlement_status as WarehouseReceiptRow["settlementStatus"],
    note: row.note as string | null,
    postedAt: row.posted_at as string,
    lines: ((row.warehouse_receipt_lines ?? []) as unknown as Array<Record<string, unknown>>).map((line) => ({
      id: line.id as string,
      expectedTransferItemId: line.expected_transfer_item_id as string,
      expectedVariantId: line.expected_variant_id as string,
      actualVariantId: line.actual_variant_id as string | null,
      expectedQty: line.expected_qty as number,
      actualGoodQty: line.actual_good_qty as number,
      actualDamagedQty: line.actual_damaged_qty as number,
      unidentifiedQty: line.unidentified_qty as number,
      expectedMissingQty: line.expected_missing_qty as number,
      actualExcessQty: line.actual_excess_qty as number,
      outcome: line.outcome as WarehouseReceiptLineRow["outcome"],
      settlementStatus: line.settlement_status as WarehouseReceiptLineRow["settlementStatus"],
      unidentifiedSku: line.unidentified_sku as string | null,
      itemNote: line.item_note as string | null,
    })),
  }));

  const corrections: WarehouseCorrectionRow[] = (correctionRows ?? []).map((row) => ({
    id: row.id as string,
    correctionNumber: row.correction_number as string,
    correctionType: row.correction_type as WarehouseCorrectionRow["correctionType"],
    status: row.status as WarehouseCorrectionRow["status"],
    reasonCode: row.reason_code as string,
    note: row.note as string,
    requestedAt: row.requested_at as string,
    approvedAt: row.approved_at as string | null,
    postedAt: row.posted_at as string | null,
    rejectionNote: row.rejection_note as string | null,
    reversesCorrectionId: row.reverses_correction_id as string | null,
    lines: ((row.warehouse_correction_lines ?? []) as unknown as Array<Record<string, unknown>>).map((line) => ({
      id: line.id as string,
      action: line.action as WarehouseCorrectionLineRow["action"],
      fromVariantId: line.from_variant_id as string | null,
      toVariantId: line.to_variant_id as string | null,
      sourceReceiptLineId: line.source_receipt_line_id as string | null,
      sourceBucket: line.source_bucket as WarehouseCorrectionLineRow["sourceBucket"],
      quantity: line.quantity as number,
      note: line.note as string | null,
    })),
  }));

  return { receipts, corrections };
}

export async function getWarehouseReceiptVariantOptions(brandId: string): Promise<WarehouseReceiptVariantOption[]> {
  const { data: variantRows, error } = await supabaseAdmin
    .from("product_variants")
    .select("id, sku, product_id, products!inner(name, brand_id)")
    .eq("products.brand_id", brandId)
    .eq("is_archived", false)
    .eq("selling_status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getWarehouseReceiptVariantOptions(${brandId}) failed: ${error.message}`);

  const ids = (variantRows ?? []).map((row) => row.id as string);
  const { data: valueRows, error: valueError } = ids.length
    ? await supabaseAdmin
      .from("product_variant_values")
      .select("variant_id, option_values(label)")
      .in("variant_id", ids)
    : { data: [], error: null };
  if (valueError) throw new Error(`getWarehouseReceiptVariantOptions(${brandId}) values failed: ${valueError.message}`);

  const valuesByVariant = new Map<string, { label: string }[]>();
  for (const row of valueRows ?? []) {
    const option = row.option_values as unknown as { label: string } | null;
    if (!option) continue;
    const current = valuesByVariant.get(row.variant_id as string) ?? [];
    current.push(option);
    valuesByVariant.set(row.variant_id as string, current);
  }

  return (variantRows ?? []).map((row) => ({
    variantId: row.id as string,
    productName: (row.products as unknown as { name: string }).name,
    sku: row.sku as string,
    optionLabel: joinOptionLabel(valuesByVariant.get(row.id as string)),
  }));
}

export async function getAllWarehouseTransfers(status?: WarehouseTransferStatus): Promise<WarehouseTransferRow[]> {
  let query = supabaseAdmin
    .from("warehouse_transfers")
    .select("id, brand_id, status, direction, document_number, document_type, has_discrepancy, requested_at, requested_by, brand_note, approved_at, approved_by, decided_at, decided_by, receiving_note, updated_at, brands(name, slug, logo_image)")
    .order("requested_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data: transferRows, error } = await query;
  if (error) throw new Error(`getAllWarehouseTransfers() failed: ${error.message}`);

  const transfers = transferRows ?? [];
  const itemsByTransfer = await attachItems(transfers);

  return transfers.map((t) => ({
    id: t.id as string,
    brandId: t.brand_id as string,
    brandName: (t.brands as unknown as { name: string; slug: string; logo_image: string | null } | null)?.name ?? "",
    brandSlug: (t.brands as unknown as { name: string; slug: string; logo_image: string | null } | null)?.slug ?? "",
    brandLogoImage: (t.brands as unknown as { logo_image: string | null } | null)?.logo_image ?? null,
    direction: t.direction as WarehouseTransferRow["direction"],
    status: t.status as WarehouseTransferRow["status"],
    documentNumber: t.document_number as string | null,
    documentType: t.document_type as WarehouseTransferRow["documentType"],
    hasDiscrepancy: Boolean(t.has_discrepancy),
    reconciliationStatus: t.has_discrepancy ? "open_discrepancy" : t.status === "received" ? "clean" : "unreviewed",
    requestedAt: t.requested_at as string,
    requestedByEmail: null,
    brandNote: t.brand_note as string | null,
    decidedAt: t.decided_at as string | null,
    decidedByEmail: null,
    receivingNote: t.receiving_note as string | null,
    approvedAt: t.approved_at as string | null,
    approvedByEmail: null,
    updatedAt: t.updated_at as string,
    items: itemsByTransfer.get(t.id as string) ?? [],
    receipts: [],
    corrections: [],
  }));
}

export async function getWarehouseTransferById(id: string): Promise<WarehouseTransferRow | null> {
  const { data: t, error } = await supabaseAdmin
    .from("warehouse_transfers")
    .select("id, brand_id, status, direction, document_number, document_type, has_discrepancy, requested_at, requested_by, brand_note, approved_at, approved_by, decided_at, decided_by, receiving_note, updated_at, brands(name, slug, logo_image)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getWarehouseTransferById(${id}) failed: ${error.message}`);
  if (!t) return null;

  const [itemsByTransfer, history] = await Promise.all([
    attachItems([t]),
    getWarehouseDocumentHistory(id),
  ]);
  const [requestedByEmail, approvedByEmail, decidedByEmail] = await Promise.all([
    emailFor(t.requested_by as string | null),
    emailFor(t.approved_by as string | null),
    emailFor(t.decided_by as string | null),
  ]);
  return {
    id: t.id as string,
    brandId: t.brand_id as string,
    brandName: (t.brands as unknown as { name: string; slug: string; logo_image: string | null } | null)?.name ?? "",
    brandSlug: (t.brands as unknown as { name: string; slug: string; logo_image: string | null } | null)?.slug ?? "",
    brandLogoImage: (t.brands as unknown as { logo_image: string | null } | null)?.logo_image ?? null,
    direction: t.direction as WarehouseTransferRow["direction"],
    status: t.status as WarehouseTransferRow["status"],
    documentNumber: t.document_number as string | null,
    documentType: t.document_type as WarehouseTransferRow["documentType"],
    hasDiscrepancy: Boolean(t.has_discrepancy),
    reconciliationStatus: history.corrections.some((correction) => correction.status === "posted")
      ? "corrected"
      : history.receipts.some((receipt) => receipt.settlementStatus === "open_discrepancy" || receipt.settlementStatus === "partially_settled")
        ? "open_discrepancy"
        : t.has_discrepancy
          ? "open_discrepancy"
          : t.status === "received"
            ? "clean"
            : "unreviewed",
    requestedAt: t.requested_at as string,
    requestedByEmail,
    brandNote: t.brand_note as string | null,
    decidedAt: t.decided_at as string | null,
    decidedByEmail,
    receivingNote: t.receiving_note as string | null,
    approvedAt: t.approved_at as string | null,
    approvedByEmail,
    updatedAt: t.updated_at as string,
    items: itemsByTransfer.get(t.id as string) ?? [],
    receipts: history.receipts,
    corrections: history.corrections,
  };
}
