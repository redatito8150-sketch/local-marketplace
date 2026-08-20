import { supabaseAdmin } from "@/lib/supabase/admin";

export type ProductLifecycleState = "draft" | "published" | "paused" | "archived" | "deleted";

export interface DeletionBlocker {
  code: string;
  kind: "immutable" | "temporary";
  message: string;
  resolution: string;
  count?: number | null;
  quantity?: number | null;
  href?: string | null;
}

export interface DeletionBlockerDestination {
  href: string;
  label: string;
}

export interface ProductDeletionEligibility {
  productId: string;
  lifecycle: ProductLifecycleState;
  // Now true only when the product has immutable history AND is otherwise
  // live (Published/Paused) — Archive is a fallback, never an ordinary
  // action, so this is what the UI gates the "Archive product" button on.
  canArchive: boolean;
  canDeleteDraft: boolean;
  // A Published/Paused product with no immutable history and no temporary
  // blockers — the delete-first path this branch adds.
  canDeleteLive: boolean;
  canDeleteArchived: boolean;
  canRestore: boolean;
  mustRetainHistory: boolean;
  hasTemporaryBlockers: boolean;
  hasActiveHold: boolean;
  immutableReasons: DeletionBlocker[];
  temporaryBlockers: DeletionBlocker[];
  restoreBlockers: DeletionBlocker[];
  blockers: DeletionBlocker[];
}

export interface DeletionRpcResult {
  ok: boolean;
  code: string;
  message: string;
  lifecycle?: ProductLifecycleState;
  holdId?: string;
  blockers?: DeletionBlocker[];
  eligibility?: ProductDeletionEligibility;
  before?: unknown;
  mediaJobsQueued?: number;
}

function toEligibility(raw: unknown): ProductDeletionEligibility {
  const value = raw as Partial<ProductDeletionEligibility>;
  return {
    productId: String(value.productId ?? ""),
    lifecycle: value.lifecycle ?? "deleted",
    canArchive: Boolean(value.canArchive),
    canDeleteDraft: Boolean(value.canDeleteDraft),
    canDeleteLive: Boolean(value.canDeleteLive),
    canDeleteArchived: Boolean(value.canDeleteArchived),
    canRestore: Boolean(value.canRestore),
    mustRetainHistory: Boolean(value.mustRetainHistory),
    hasTemporaryBlockers: Boolean(value.hasTemporaryBlockers),
    hasActiveHold: Boolean(value.hasActiveHold),
    immutableReasons: Array.isArray(value.immutableReasons) ? value.immutableReasons : [],
    temporaryBlockers: Array.isArray(value.temporaryBlockers) ? value.temporaryBlockers : [],
    restoreBlockers: Array.isArray(value.restoreBlockers) ? value.restoreBlockers : [],
    blockers: Array.isArray(value.blockers) ? value.blockers : [],
  };
}

async function callDeletionRpc(fn: string, args: Record<string, unknown>): Promise<DeletionRpcResult> {
  const { data, error } = await supabaseAdmin.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return data as DeletionRpcResult;
}

export async function getProductDeletionEligibility(productId: string) {
  const { data, error } = await supabaseAdmin.rpc("get_product_deletion_eligibility", { p_product_id: productId });
  if (error) throw new Error(`getProductDeletionEligibility(${productId}) failed: ${error.message}`);
  return toEligibility(data);
}

export function archiveProduct(productId: string, brandId: string | null, actorId: string, actorLabel: string) {
  return callDeletionRpc("archive_product", {
    p_product_id: productId,
    p_brand_id: brandId,
    p_actor_id: actorId,
    p_actor_label: actorLabel,
  });
}

function deleteProduct(
  rpc: "delete_draft_product" | "delete_archived_product",
  productId: string,
  brandId: string | null,
  actorId: string,
  actorLabel: string,
  reason: string,
  operationKey: string
) {
  return callDeletionRpc(rpc, {
    p_product_id: productId,
    p_brand_id: brandId,
    p_actor_id: actorId,
    p_actor_label: actorLabel,
    p_reason: reason,
    p_operation_key: operationKey,
  });
}

export function deleteDraftProduct(productId: string, brandId: string | null, actorId: string, actorLabel: string, reason: string, operationKey: string) {
  return deleteProduct("delete_draft_product", productId, brandId, actorId, actorLabel, reason, operationKey);
}

export function deleteArchivedProduct(productId: string, brandId: string | null, actorId: string, actorLabel: string, reason: string, operationKey: string) {
  return deleteProduct("delete_archived_product", productId, brandId, actorId, actorLabel, reason, operationKey);
}

// Permanent deletion of a Published/Paused product — the delete-first path.
// actorLabel is accepted for signature symmetry with the other delete
// helpers even though the underlying RPC doesn't persist it directly (it's
// captured by the caller's own logAudit() instead, same as archive/pause).
export function deleteLiveProduct(
  productId: string,
  brandId: string | null,
  actorId: string,
  actorLabel: string,
  reason: string,
  operationKey: string
) {
  return callDeletionRpc("delete_live_product", {
    p_product_id: productId,
    p_brand_id: brandId,
    p_actor_id: actorId,
    p_actor_label: actorLabel,
    p_reason: reason,
    p_operation_key: operationKey,
  });
}

export function pauseProduct(productId: string, brandId: string | null, actorId: string) {
  return callDeletionRpc("pause_product", {
    p_product_id: productId,
    p_brand_id: brandId,
    p_actor_id: actorId,
  });
}

export function resumeProduct(productId: string, brandId: string | null, actorId: string) {
  return callDeletionRpc("resume_product", {
    p_product_id: productId,
    p_brand_id: brandId,
    p_actor_id: actorId,
  });
}

// Admin-only. Restores an Archived product to Paused, never Published —
// the owner still has to Resume it deliberately.
export function adminRestoreArchivedProduct(
  productId: string,
  actorId: string,
  actorLabel: string,
  reason: string,
  operationKey: string
) {
  return callDeletionRpc("admin_restore_archived_product", {
    p_product_id: productId,
    p_actor_id: actorId,
    p_actor_label: actorLabel,
    p_reason: reason,
    p_operation_key: operationKey,
  });
}

export function adminEmergencyHideProduct(productId: string, actorId: string, actorLabel: string, reason: string) {
  return callDeletionRpc("admin_emergency_hide_product", {
    p_product_id: productId,
    p_actor_id: actorId,
    p_actor_label: actorLabel,
    p_reason: reason,
  });
}

export function applyProductDeletionHold(productId: string, actorId: string, actorLabel: string, reason: string) {
  return callDeletionRpc("apply_product_deletion_hold", {
    p_product_id: productId,
    p_actor_id: actorId,
    p_actor_label: actorLabel,
    p_reason: reason,
  });
}

export function releaseProductDeletionHold(productId: string, actorId: string, actorLabel: string) {
  return callDeletionRpc("release_product_deletion_hold", {
    p_product_id: productId,
    p_actor_id: actorId,
    p_actor_label: actorLabel,
  });
}

export interface ActiveHold {
  id: string;
  reason: string;
  createdByLabel: string;
  createdAt: string;
}

export async function getActiveHoldForProduct(productId: string): Promise<ActiveHold | null> {
  const { data, error } = await supabaseAdmin
    .from("product_deletion_holds")
    .select("id, reason, created_by_label, created_at")
    .eq("product_id", productId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`getActiveHoldForProduct(${productId}) failed: ${error.message}`);
  return data ? { id: data.id, reason: data.reason, createdByLabel: data.created_by_label, createdAt: data.created_at } : null;
}

export interface ArchivedProductRow {
  id: string;
  name: string;
  sku: string;
  image: string;
  brandId: string;
  brandName: string;
  archivedAt: string | null;
  eligibility: ProductDeletionEligibility;
}

export interface ArchivedProductListPage {
  rows: ArchivedProductRow[];
  total: number;
  limit: number;
  offset: number;
}

export async function listArchivedProducts(filters: { brandId?: string; search?: string; limit?: number; offset?: number } = {}): Promise<ArchivedProductListPage> {
  const { data, error } = await supabaseAdmin.rpc("search_archived_products", {
    p_brand_id: filters.brandId ?? null,
    p_search: filters.search ?? null,
    p_limit: filters.limit ?? 25,
    p_offset: filters.offset ?? 0,
  });
  if (error) throw new Error(`listArchivedProducts() failed: ${error.message}`);
  return data as ArchivedProductListPage;
}

export async function claimProductStorageAssets(args: {
  productId: string;
  uploadedBy: string;
  uploadFolderId: string;
  publicUrls: string[];
}) {
  const { data, error } = await supabaseAdmin.rpc("claim_product_storage_assets", {
    p_product_id: args.productId,
    p_uploaded_by: args.uploadedBy,
    p_upload_folder_id: args.uploadFolderId,
    p_public_urls: args.publicUrls,
  });
  if (error) throw new Error(`claimProductStorageAssets(${args.productId}) failed: ${error.message}`);
  return Number(data ?? 0);
}

export interface ProductDeletionHistoryRow {
  id: string;
  product_id_snapshot: string;
  product_name_snapshot: string;
  product_sku_snapshot: string | null;
  product_image_snapshot: string | null;
  brand_id: string;
  deleted_from: "draft" | "published" | "paused" | "archived";
  deleted_by_label: string;
  reason: string | null;
  media_jobs_queued: number;
  deleted_at: string;
}

export async function listProductDeletionHistory(filters: { search?: string; limit?: number; offset?: number } = {}) {
  const { data, error } = await supabaseAdmin.rpc("search_product_deletion_history", {
    p_brand_id: null,
    p_search: filters.search ?? null,
    p_limit: filters.limit ?? 25,
    p_offset: filters.offset ?? 0,
  });
  if (error) throw new Error(`listProductDeletionHistory() failed: ${error.message}`);
  return data as { rows: ProductDeletionHistoryRow[]; total: number; limit: number; offset: number };
}
