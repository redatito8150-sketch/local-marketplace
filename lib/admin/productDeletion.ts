import { supabaseAdmin } from "@/lib/supabase/admin";

// Canonical, database-authoritative product deletion eligibility. The
// database (private.compute_product_deletion_eligibility, supabase/
// migrations/20260814020000_product_deletion_lifecycle.sql) is the single
// source of truth — this file only types and forwards its jsonb result and
// wraps every lifecycle RPC it also defines. No business rule here is
// re-implemented in application code; every route that needs to know
// whether a product can be archived/restored/deleted/requested calls one
// of the functions below instead of re-deriving the answer itself.
export type DeletionBlockerCategory =
  | "orders"
  | "inventory"
  | "warehouse"
  | "returns"
  | "reviews"
  | "payments"
  | "transition"
  | "permissions"
  | "other";

export interface DeletionBlocker {
  code: string;
  category: DeletionBlockerCategory;
  message: string;
  count?: number | null;
  quantity?: number | null;
  relatedEntityId?: string | null;
  relatedEntityNumber?: string | null;
  href?: string | null;
}

export type ProductLifecycleState = "active" | "draft" | "archived" | "historical";

export interface ProductDeletionEligibility {
  productId: string;
  lifecycle: ProductLifecycleState;
  canArchive: boolean;
  canRestore: boolean;
  canDeleteImmediately: boolean;
  canRequestDeletion: boolean;
  mustRetainHistory: boolean;
  blockers: DeletionBlocker[];
}

// Every mutating RPC returns this same envelope shape. `mediaUrls`/
// `mediaJobsQueued` are only ever populated by the two RPCs that actually
// hard-delete a product row (delete_draft_product,
// admin_approve_product_deletion) — purely informational for callers/
// tests. The RPC itself already enqueued the cleanup jobs transactionally
// (private.queue_owned_product_media_cleanup, same transaction as the
// delete) — no caller needs to do anything further with these fields.
export interface DeletionRpcResult {
  ok: boolean;
  code: string;
  message: string;
  lifecycle?: ProductLifecycleState | "deleted";
  requestId?: string;
  requestState?: string;
  blockers?: DeletionBlocker[];
  before?: unknown;
  mediaJobsQueued?: number;
  mediaUrls?: string[];
}

function toEligibility(raw: unknown): ProductDeletionEligibility {
  const value = raw as ProductDeletionEligibility;
  return {
    productId: value.productId,
    lifecycle: value.lifecycle,
    canArchive: Boolean(value.canArchive),
    canRestore: Boolean(value.canRestore),
    canDeleteImmediately: Boolean(value.canDeleteImmediately),
    canRequestDeletion: Boolean(value.canRequestDeletion),
    mustRetainHistory: Boolean(value.mustRetainHistory),
    blockers: Array.isArray(value.blockers) ? value.blockers : [],
  };
}

// `ignoreRequestId`: when computing eligibility on behalf of a specific
// deletion request (the admin review/approve flows), pass that request's
// own id so its own still-open status is never counted as a blocker
// against itself — see the SQL function's own comment for the bug this
// fixes.
export async function getProductDeletionEligibility(productId: string, ignoreRequestId?: string): Promise<ProductDeletionEligibility> {
  const { data, error } = await supabaseAdmin.rpc("get_product_deletion_eligibility", {
    p_product_id: productId,
    p_ignore_request_id: ignoreRequestId ?? null,
  });
  if (error) throw new Error(`getProductDeletionEligibility(${productId}) failed: ${error.message}`);
  return toEligibility(data);
}

async function callDeletionRpc(fn: string, args: Record<string, unknown>): Promise<DeletionRpcResult> {
  const { data, error } = await supabaseAdmin.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return data as DeletionRpcResult;
}

// p_brand_id: pass the calling brand's id from brand-portal routes (the RPC
// verifies the product actually belongs to it); pass null from admin
// routes, which have already authorized the caller as staff/admin.
export function archiveProduct(productId: string, brandId: string | null, actorId: string, actorLabel: string) {
  return callDeletionRpc("archive_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: actorId, p_actor_label: actorLabel });
}

export function restoreProduct(productId: string, brandId: string | null, actorId: string, actorLabel: string) {
  return callDeletionRpc("restore_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: actorId, p_actor_label: actorLabel });
}

export function deleteDraftProduct(productId: string, brandId: string | null, actorId: string, actorLabel: string) {
  return callDeletionRpc("delete_draft_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: actorId, p_actor_label: actorLabel });
}

export function requestProductDeletion(
  productId: string,
  brandId: string | null,
  actorId: string,
  actorLabel: string,
  reason: string,
  operationKey: string
) {
  return callDeletionRpc("request_product_deletion", {
    p_product_id: productId, p_brand_id: brandId, p_actor_id: actorId, p_actor_label: actorLabel,
    p_reason: reason, p_operation_key: operationKey,
  });
}

export function cancelProductDeletionRequest(productId: string, brandId: string | null, actorId: string, actorLabel: string) {
  return callDeletionRpc("cancel_product_deletion_request", { p_product_id: productId, p_brand_id: brandId, p_actor_id: actorId, p_actor_label: actorLabel });
}

export function adminUpdateDeletionRequest(
  requestId: string,
  actorId: string,
  actorLabel: string,
  newStatus: "under_review" | "blocked" | "rejected",
  adminNote: string
) {
  return callDeletionRpc("admin_update_deletion_request", {
    p_request_id: requestId, p_actor_id: actorId, p_actor_label: actorLabel,
    p_new_status: newStatus, p_admin_note: adminNote,
  });
}

export function adminApproveProductDeletion(requestId: string, actorId: string, actorLabel: string) {
  return callDeletionRpc("admin_approve_product_deletion", { p_request_id: requestId, p_actor_id: actorId, p_actor_label: actorLabel });
}

export function adminEmergencyHideProduct(productId: string, actorId: string, actorLabel: string, reason: string) {
  return callDeletionRpc("admin_emergency_hide_product", { p_product_id: productId, p_actor_id: actorId, p_actor_label: actorLabel, p_reason: reason });
}

// `productId` is nullable — once a request reaches `completed`, the
// product row it referred to has actually been permanently deleted
// (product_id ON DELETE SET NULL). productName/productSku/productImage
// are immutable snapshots captured at request time and refreshed right
// before deletion at approval time, so a completed request's history
// stays fully readable forever even though the live product is gone.
export interface DeletionRequestRow {
  id: string;
  productId: string | null;
  productName: string;
  productSku: string | null;
  productImage: string | null;
  brandId: string;
  requestedBy: string | null;
  requestedByLabel: string;
  requestedAt: string;
  reason: string;
  status: "requested" | "under_review" | "blocked" | "approved" | "rejected" | "cancelled" | "completed";
  reviewedBy: string | null;
  reviewedAt: string | null;
  adminNote: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  blockerSnapshot: DeletionBlocker[];
  brandName?: string;
  brandSlug?: string;
  brandIsPartner?: boolean;
}

interface DeletionRequestSelectRow {
  id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  product_image: string | null;
  brand_id: string;
  requested_by: string | null;
  requested_by_label: string;
  requested_at: string;
  reason: string;
  status: DeletionRequestRow["status"];
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  blocker_snapshot: DeletionBlocker[] | null;
  brands?: { name: string; slug: string; is_mahaly_partner: boolean } | null;
}

function mapDeletionRequestRow(row: DeletionRequestSelectRow): DeletionRequestRow {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSku: row.product_sku,
    productImage: row.product_image,
    brandId: row.brand_id,
    requestedBy: row.requested_by,
    requestedByLabel: row.requested_by_label,
    requestedAt: row.requested_at,
    reason: row.reason,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    adminNote: row.admin_note,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    blockerSnapshot: row.blocker_snapshot ?? [],
    brandName: row.brands?.name,
    brandSlug: row.brands?.slug,
    brandIsPartner: row.brands?.is_mahaly_partner,
  };
}

export async function getDeletionRequestForProduct(productId: string): Promise<DeletionRequestRow | null> {
  const { data, error } = await supabaseAdmin
    .from("product_deletion_requests")
    .select("*, brands(name, slug, is_mahaly_partner)")
    .eq("product_id", productId)
    .in("status", ["requested", "under_review", "blocked"])
    .maybeSingle();
  if (error) throw new Error(`getDeletionRequestForProduct(${productId}) failed: ${error.message}`);
  return data ? mapDeletionRequestRow(data as DeletionRequestSelectRow) : null;
}

export async function getDeletionRequestById(requestId: string): Promise<DeletionRequestRow | null> {
  const { data, error } = await supabaseAdmin
    .from("product_deletion_requests")
    .select("*, brands(name, slug, is_mahaly_partner)")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(`getDeletionRequestById(${requestId}) failed: ${error.message}`);
  return data ? mapDeletionRequestRow(data as DeletionRequestSelectRow) : null;
}

export interface DeletionRequestListFilters {
  status?: DeletionRequestRow["status"];
  brandId?: string;
  isPartner?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface DeletionRequestListPage {
  rows: DeletionRequestRow[];
  total: number;
  limit: number;
  offset: number;
}

interface AdminSearchDeletionRequestsRow {
  id: string;
  productId: string | null;
  productName: string;
  productSku: string | null;
  productImage: string | null;
  brandId: string;
  requestedByLabel: string;
  requestedAt: string;
  reason: string;
  status: DeletionRequestRow["status"];
  reviewedAt: string | null;
  adminNote: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  blockerSnapshot: DeletionBlocker[] | null;
  brandName: string;
  brandSlug: string;
  brandIsPartner: boolean;
}

// Admin review queue — a single database-level paginated + filtered query
// (private.admin_search_deletion_requests, supabase/migrations/
// 20260814020000_product_deletion_lifecycle.sql). Status/brand/partner and
// text search (product name/id, brand name, request id) are all applied
// inside Postgres before LIMIT/OFFSET — this never loads more rows into
// memory than the current page actually needs, unlike the original
// implementation which fetched every row and filtered/paginated in JS.
export async function listDeletionRequests(filters: DeletionRequestListFilters = {}): Promise<DeletionRequestListPage> {
  const { data, error } = await supabaseAdmin.rpc("admin_search_deletion_requests", {
    p_status: filters.status ?? null,
    p_brand_id: filters.brandId ?? null,
    p_is_partner: typeof filters.isPartner === "boolean" ? filters.isPartner : null,
    p_search: filters.search ?? null,
    p_limit: filters.limit ?? 25,
    p_offset: filters.offset ?? 0,
  });
  if (error) throw new Error(`listDeletionRequests() failed: ${error.message}`);

  const result = data as { rows: AdminSearchDeletionRequestsRow[]; total: number; limit: number; offset: number };
  return {
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    rows: result.rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: row.productName,
      productSku: row.productSku,
      productImage: row.productImage,
      brandId: row.brandId,
      requestedBy: null,
      requestedByLabel: row.requestedByLabel,
      requestedAt: row.requestedAt,
      reason: row.reason,
      status: row.status,
      reviewedBy: null,
      reviewedAt: row.reviewedAt,
      adminNote: row.adminNote,
      completedAt: row.completedAt,
      cancelledAt: row.cancelledAt,
      blockerSnapshot: row.blockerSnapshot ?? [],
      brandName: row.brandName,
      brandSlug: row.brandSlug,
      brandIsPartner: row.brandIsPartner,
    })),
  };
}
