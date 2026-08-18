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
  action: "reclassify" | "adjust_in" | "adjust_out" | "move_to_hold" | "restore_to_sellable" | "return_to_brand" | "write_off" | "accept_discrepancy";
  fromVariantId: string | null;
  toVariantId: string | null;
  sourceReceiptLineId: string | null;
  sourceCorrectionLineId: string | null;
  sourceBucket: "damaged" | "missing" | "substitution" | "excess" | "unidentified" | "sellable" | "document" | null;
  quantity: number;
  note: string | null;
}

export interface WarehouseCorrectionRow {
  id: string;
  correctionNumber: string;
  correctionType: "reclassification" | "quantity_adjustment" | "missing_recovery" | "condition_resolution" | "document_amendment" | "reversal";
  status: "pending_approval" | "posted" | "rejected" | "reversed";
  reasonCode: string;
  note: string;
  requestedAt: string;
  approvedAt: string | null;
  postedAt: string | null;
  rejectionNote: string | null;
  reversesCorrectionId: string | null;
  approvalMode: "independent" | "admin_auto";
  requestedByLabel: string | null;
  approvedByLabel: string | null;
  rejectedByLabel: string | null;
  requestedByActor: WarehouseActorIdentity | null;
  approvedByActor: WarehouseActorIdentity | null;
  rejectedByActor: WarehouseActorIdentity | null;
  lines: WarehouseCorrectionLineRow[];
}

export interface WarehouseActorIdentity {
  id: string;
  displayName: string;
  email: string | null;
  isStaff: boolean;
  roleLabel: string;
}

export interface WarehouseReceiptVariantOption {
  variantId: string;
  productName: string;
  productImage: string | null;
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
  expectedArrivalAt: string | null;
  requestedByActor: WarehouseActorIdentity | null;
  approvedByActor: WarehouseActorIdentity | null;
  decidedByActor: WarehouseActorIdentity | null;
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

function warehouseActorRoleLabel(profileRole: string | null | undefined, isStaff: boolean, brandAccessLevel?: string | null): string {
  if (isStaff) {
    if (profileRole === "admin") return "Admin";
    if (profileRole === "manager") return "Manager";
    return "Staff";
  }
  if (brandAccessLevel === "owner" || profileRole === "brand_owner") return "Brand owner";
  if (brandAccessLevel === "assistant" || profileRole === "brand_assistant") return "Brand assistant";
  return "Brand member";
}

async function actorIdentityFor(userId: string | null, brandId: string): Promise<WarehouseActorIdentity | null> {
  if (!userId) return null;
  const [{ data: profile }, { data: membership }, authResult] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, full_name, email, is_admin, role").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("brand_staff").select("access_level").eq("brand_id", brandId).eq("user_id", userId).maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(userId),
  ]);
  const email = (profile?.email as string | null)?.trim() || authResult.data.user?.email || null;
  const isStaff = Boolean(profile?.is_admin);
  return {
    id: userId,
    displayName: (profile?.full_name as string | null)?.trim() || email?.split("@")[0] || "Team member",
    email,
    isStaff,
    roleLabel: warehouseActorRoleLabel(profile?.role as string | null, isStaff, membership?.access_level as string | null),
  };
}

async function expectedArrivalForTransfer(transferId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("warehouse_transfers")
    .select("expected_arrival_at")
    .eq("id", transferId)
    .maybeSingle();
  if (error) {
    const detail = [error.message, error.details, error.hint].filter(Boolean).join(" ");
    if (new Set(["42703", "PGRST204"]).has(error.code) && detail.includes("expected_arrival_at")) return null;
    throw new Error(`expectedArrivalForTransfer(${transferId}) failed: ${error.message}`);
  }
  return data?.expected_arrival_at as string | null ?? null;
}

function resolveWarehouseReconciliationStatus(
  transfer: {
    status: unknown;
    reconciliation_status?: unknown;
    warehouse_receipts?: Array<{ id: string }> | null;
  },
  items: WarehouseTransferItemRow[],
): WarehouseTransferRow["reconciliationStatus"] {
  const stored = transfer.reconciliation_status as WarehouseTransferRow["reconciliationStatus"] | undefined;
  const hasCanonicalReceipt = (transfer.warehouse_receipts ?? []).length > 0;
  if (hasCanonicalReceipt || stored === "settled" || stored === "corrected") return stored ?? "unreviewed";

  const hasUnresolvedLegacyDiscrepancy = items.some((item) =>
    ((item.damagedQty ?? 0) + (item.missingQty ?? 0)) > 0 && !item.quarantineResolvedAt
  );
  if (hasUnresolvedLegacyDiscrepancy) return "open_discrepancy";
  return transfer.status === "received" ? "clean" : stored ?? "unreviewed";
}

export async function getBrandWarehouseTransfers(brandId: string): Promise<WarehouseTransferRow[]> {
  const { data: transferRows, error } = await supabaseAdmin
    .from("warehouse_transfers")
    .select("id, brand_id, status, direction, document_number, document_type, has_discrepancy, reconciliation_status, requested_at, requested_by, brand_note, approved_at, approved_by, decided_at, decided_by, receiving_note, updated_at, brands(name, slug, logo_image), warehouse_receipts(id)")
    .eq("brand_id", brandId)
    .order("requested_at", { ascending: false });
  if (error) throw new Error(`getBrandWarehouseTransfers(${brandId}) failed: ${error.message}`);

  const transfers = transferRows ?? [];
  const itemsByTransfer = await attachItems(transfers);
  return transfers.map((t) => {
    const items = itemsByTransfer.get(t.id as string) ?? [];
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
    reconciliationStatus: resolveWarehouseReconciliationStatus(t, items),
    requestedAt: t.requested_at as string,
    requestedByEmail: null,
    brandNote: t.brand_note as string | null,
    decidedAt: t.decided_at as string | null,
    decidedByEmail: null,
    receivingNote: t.receiving_note as string | null,
    approvedAt: t.approved_at as string | null,
    approvedByEmail: null,
    expectedArrivalAt: null,
    requestedByActor: null,
    approvedByActor: null,
    decidedByActor: null,
    updatedAt: t.updated_at as string,
    items,
    receipts: [],
    corrections: [],
    };
  });
}

async function getWarehouseDocumentHistory(transferId: string, brandId: string): Promise<{
  receipts: WarehouseReceiptRow[];
  corrections: WarehouseCorrectionRow[];
}> {
  const [receiptResult, initialCorrectionResult] = await Promise.all([
    supabaseAdmin
      .from("warehouse_receipts")
      .select("id, receipt_number, status, settlement_status, note, posted_at, warehouse_receipt_lines(id, expected_transfer_item_id, expected_variant_id, actual_variant_id, expected_qty, actual_good_qty, actual_damaged_qty, unidentified_qty, expected_missing_qty, actual_excess_qty, outcome, settlement_status, unidentified_sku, item_note)")
      .eq("transfer_id", transferId)
      .order("posted_at", { ascending: false }),
    supabaseAdmin
      .from("warehouse_corrections")
      .select("id, correction_number, correction_type, status, reason_code, note, requested_by, approved_by, rejected_by, approval_mode, requested_at, approved_at, posted_at, rejection_note, reverses_correction_id, warehouse_correction_lines(id, action, from_variant_id, to_variant_id, source_receipt_line_id, source_correction_line_id, source_bucket, quantity, note)")
      .eq("transfer_id", transferId)
      .order("requested_at", { ascending: false }),
  ]);

  const { data: receiptRows, error: receiptError } = receiptResult;
  let correctionRows = initialCorrectionResult.data as unknown as Array<Record<string, unknown>> | null;
  let correctionError = initialCorrectionResult.error;

  // The closed-document workflow adds a self-reference used to resolve stock
  // that was moved to hold by an earlier correction. During local review, keep
  // the existing receipt history visible before that migration is applied.
  const correctionErrorText = correctionError
    ? [correctionError.message, correctionError.details, correctionError.hint].filter(Boolean).join(" ")
    : "";
  const missingCorrectionEnhancementColumn = correctionError
    && new Set(["42703", "PGRST204"]).has(correctionError.code)
    && (correctionErrorText.includes("source_correction_line_id") || correctionErrorText.includes("approval_mode"));
  if (missingCorrectionEnhancementColumn) {
    const fallback = await supabaseAdmin
      .from("warehouse_corrections")
      .select("id, correction_number, correction_type, status, reason_code, note, requested_by, approved_by, rejected_by, requested_at, approved_at, posted_at, rejection_note, reverses_correction_id, warehouse_correction_lines(id, action, from_variant_id, to_variant_id, source_receipt_line_id, source_bucket, quantity, note)")
      .eq("transfer_id", transferId)
      .order("requested_at", { ascending: false });
    correctionRows = fallback.data as unknown as Array<Record<string, unknown>> | null;
    correctionError = fallback.error;
  }

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

  const actorIds = [...new Set((correctionRows ?? []).flatMap((row) => [row.requested_by, row.approved_by, row.rejected_by]).filter((id): id is string => typeof id === "string"))];
  const actorById = new Map<string, WarehouseActorIdentity>();
  if (actorIds.length) {
    const [{ data: actors, error: actorError }, { data: memberships, error: membershipError }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, email, is_admin, role").in("id", actorIds),
      supabaseAdmin.from("brand_staff").select("user_id, access_level").eq("brand_id", brandId).in("user_id", actorIds),
    ]);
    if (actorError) throw new Error(`getWarehouseDocumentHistory(${transferId}) actors failed: ${actorError.message}`);
    if (membershipError) throw new Error(`getWarehouseDocumentHistory(${transferId}) memberships failed: ${membershipError.message}`);
    const accessByActorId = new Map((memberships ?? []).map((membership) => [membership.user_id as string, membership.access_level as string]));
    for (const actor of actors ?? []) {
      const email = (actor.email as string | null)?.trim() || null;
      const isStaff = Boolean(actor.is_admin);
      actorById.set(actor.id as string, {
        id: actor.id as string,
        displayName: (actor.full_name as string | null)?.trim() || email?.split("@")[0] || "Team member",
        email,
        isStaff,
        roleLabel: warehouseActorRoleLabel(actor.role as string | null, isStaff, accessByActorId.get(actor.id as string)),
      });
    }
  }

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
    approvalMode: row.approval_mode === "admin_auto" ? "admin_auto" : "independent",
    requestedByLabel: typeof row.requested_by === "string" ? actorById.get(row.requested_by)?.displayName ?? "Administrator" : null,
    approvedByLabel: typeof row.approved_by === "string" ? actorById.get(row.approved_by)?.displayName ?? "Administrator" : null,
    rejectedByLabel: typeof row.rejected_by === "string" ? actorById.get(row.rejected_by)?.displayName ?? "Administrator" : null,
    requestedByActor: typeof row.requested_by === "string" ? actorById.get(row.requested_by) ?? null : null,
    approvedByActor: typeof row.approved_by === "string" ? actorById.get(row.approved_by) ?? null : null,
    rejectedByActor: typeof row.rejected_by === "string" ? actorById.get(row.rejected_by) ?? null : null,
    lines: ((row.warehouse_correction_lines ?? []) as Array<Record<string, unknown>>).map((line) => ({
      id: line.id as string,
      action: line.action as WarehouseCorrectionLineRow["action"],
      fromVariantId: line.from_variant_id as string | null,
      toVariantId: line.to_variant_id as string | null,
      sourceReceiptLineId: line.source_receipt_line_id as string | null,
      sourceCorrectionLineId: line.source_correction_line_id as string | null,
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
    .select("id, sku, product_id, products!inner(name, image, brand_id)")
    .eq("products.brand_id", brandId)
    .eq("is_archived", false)
    .eq("selling_status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getWarehouseReceiptVariantOptions(${brandId}) failed: ${error.message}`);

  const ids = (variantRows ?? []).map((row) => row.id as string);
  const productIds = [...new Set((variantRows ?? []).map((row) => row.product_id as string))];
  const [valuesResult, mediaResult] = await Promise.all([
    ids.length
      ? supabaseAdmin
        .from("product_variant_values")
        .select("variant_id, option_value_id, option_values(id, label, option_types(name))")
        .in("variant_id", ids)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabaseAdmin
        .from("product_media")
        .select("product_id, storage_reference, color_option_value_id")
        .in("product_id", productIds)
        .eq("is_archived", false)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (valuesResult.error) throw new Error(`getWarehouseReceiptVariantOptions(${brandId}) values failed: ${valuesResult.error.message}`);
  if (mediaResult.error) throw new Error(`getWarehouseReceiptVariantOptions(${brandId}) media failed: ${mediaResult.error.message}`);

  const optionsByVariant = new Map<string, { optionTypeId: string; optionTypeName: string; optionValueId: string; label: string }[]>();
  for (const row of valuesResult.data ?? []) {
    const option = row.option_values as unknown as { id: string; label: string; option_types: { name: string } | null } | null;
    if (!option) continue;
    const current = optionsByVariant.get(row.variant_id as string) ?? [];
    current.push({
      optionTypeId: option.option_types?.name ?? "",
      optionTypeName: option.option_types?.name ?? "",
      optionValueId: (row.option_value_id as string) || option.id,
      label: option.label,
    });
    optionsByVariant.set(row.variant_id as string, current);
  }
  const colorImages = buildColorImageLookup(mediaResult.data ?? []);

  return (variantRows ?? []).map((row) => {
    const product = row.products as unknown as { name: string; image: string | null };
    const optionValues = optionsByVariant.get(row.id as string) ?? [];
    return {
      variantId: row.id as string,
      productName: product.name,
      productImage: resolveVariantImage(row.product_id as string, { optionValues }, colorImages, product.image) || null,
      sku: row.sku as string,
      optionLabel: joinOptionLabel(optionValues),
    };
  });
}

export async function getAllWarehouseTransfers(status?: WarehouseTransferStatus): Promise<WarehouseTransferRow[]> {
  let query = supabaseAdmin
    .from("warehouse_transfers")
    .select("id, brand_id, status, direction, document_number, document_type, has_discrepancy, reconciliation_status, requested_at, requested_by, brand_note, approved_at, approved_by, decided_at, decided_by, receiving_note, updated_at, brands(name, slug, logo_image), warehouse_receipts(id)")
    .order("requested_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data: transferRows, error } = await query;
  if (error) throw new Error(`getAllWarehouseTransfers() failed: ${error.message}`);

  const transfers = transferRows ?? [];
  const itemsByTransfer = await attachItems(transfers);

  return transfers.map((t) => {
    const items = itemsByTransfer.get(t.id as string) ?? [];

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
    reconciliationStatus: resolveWarehouseReconciliationStatus(t, items),
    requestedAt: t.requested_at as string,
    requestedByEmail: null,
    brandNote: t.brand_note as string | null,
    decidedAt: t.decided_at as string | null,
    decidedByEmail: null,
    receivingNote: t.receiving_note as string | null,
    approvedAt: t.approved_at as string | null,
    approvedByEmail: null,
    expectedArrivalAt: null,
    requestedByActor: null,
    approvedByActor: null,
    decidedByActor: null,
    updatedAt: t.updated_at as string,
    items,
    receipts: [],
    corrections: [],
    };
  });
}

export async function getWarehouseTransferById(id: string): Promise<WarehouseTransferRow | null> {
  const { data: t, error } = await supabaseAdmin
    .from("warehouse_transfers")
    .select("id, brand_id, status, direction, document_number, document_type, has_discrepancy, reconciliation_status, requested_at, requested_by, brand_note, approved_at, approved_by, decided_at, decided_by, receiving_note, updated_at, brands(name, slug, logo_image)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getWarehouseTransferById(${id}) failed: ${error.message}`);
  if (!t) return null;

  const [itemsByTransfer, history] = await Promise.all([
    attachItems([t]),
    getWarehouseDocumentHistory(id, t.brand_id as string),
  ]);
  const [requestedByActor, approvedByActor, decidedByActor, expectedArrivalAt] = await Promise.all([
    actorIdentityFor(t.requested_by as string | null, t.brand_id as string),
    actorIdentityFor(t.approved_by as string | null, t.brand_id as string),
    actorIdentityFor(t.decided_by as string | null, t.brand_id as string),
    expectedArrivalForTransfer(id),
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
        : t.reconciliation_status as WarehouseTransferRow["reconciliationStatus"],
    requestedAt: t.requested_at as string,
    requestedByEmail: requestedByActor?.email ?? null,
    brandNote: t.brand_note as string | null,
    decidedAt: t.decided_at as string | null,
    decidedByEmail: decidedByActor?.email ?? null,
    receivingNote: t.receiving_note as string | null,
    approvedAt: t.approved_at as string | null,
    approvedByEmail: approvedByActor?.email ?? null,
    expectedArrivalAt,
    requestedByActor,
    approvedByActor,
    decidedByActor,
    updatedAt: t.updated_at as string,
    items: itemsByTransfer.get(t.id as string) ?? [],
    receipts: history.receipts,
    corrections: history.corrections,
  };
}
