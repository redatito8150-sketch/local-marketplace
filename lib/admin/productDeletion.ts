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

// Every mutating RPC returns this same envelope shape.
export interface DeletionRpcResult {
  ok: boolean;
  code: string;
  message: string;
  lifecycle?: ProductLifecycleState | "deleted";
  requestId?: string;
  requestState?: string;
  blockers?: DeletionBlocker[];
  before?: unknown;
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

export async function getProductDeletionEligibility(productId: string): Promise<ProductDeletionEligibility> {
  const { data, error } = await supabaseAdmin.rpc("get_product_deletion_eligibility", { p_product_id: productId });
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

export interface DeletionRequestRow {
  id: string;
  productId: string;
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
  productName?: string;
  productImage?: string;
  brandName?: string;
  brandSlug?: string;
  brandIsPartner?: boolean;
}

interface DeletionRequestSelectRow {
  id: string;
  product_id: string;
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
  products?: { name: string; image: string } | null;
  brands?: { name: string; slug: string; is_mahaly_partner: boolean } | null;
}

function mapDeletionRequestRow(row: DeletionRequestSelectRow): DeletionRequestRow {
  return {
    id: row.id,
    productId: row.product_id,
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
    productName: row.products?.name,
    productImage: row.products?.image,
    brandName: row.brands?.name,
    brandSlug: row.brands?.slug,
    brandIsPartner: row.brands?.is_mahaly_partner,
  };
}

export async function getDeletionRequestForProduct(productId: string): Promise<DeletionRequestRow | null> {
  const { data, error } = await supabaseAdmin
    .from("product_deletion_requests")
    .select("*")
    .eq("product_id", productId)
    .in("status", ["requested", "under_review", "blocked"])
    .maybeSingle();
  if (error) throw new Error(`getDeletionRequestForProduct(${productId}) failed: ${error.message}`);
  return data ? mapDeletionRequestRow(data as DeletionRequestSelectRow) : null;
}

export interface DeletionRequestListFilters {
  status?: DeletionRequestRow["status"];
  brandId?: string;
  isPartner?: boolean;
  search?: string;
}

// Admin review queue — filterable list, newest first.
export async function listDeletionRequests(filters: DeletionRequestListFilters = {}): Promise<DeletionRequestRow[]> {
  let query = supabaseAdmin
    .from("product_deletion_requests")
    .select("*, products(name, image), brands(name, slug, is_mahaly_partner)")
    .order("requested_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.brandId) query = query.eq("brand_id", filters.brandId);

  const { data, error } = await query;
  if (error) throw new Error(`listDeletionRequests() failed: ${error.message}`);

  let rows = ((data ?? []) as DeletionRequestSelectRow[]).map(mapDeletionRequestRow);
  if (typeof filters.isPartner === "boolean") {
    rows = rows.filter((row) => row.brandIsPartner === filters.isPartner);
  }
  if (filters.search) {
    const needle = filters.search.trim().toLowerCase();
    rows = rows.filter((row) =>
      row.productName?.toLowerCase().includes(needle) ||
      row.productId.toLowerCase().includes(needle) ||
      row.brandName?.toLowerCase().includes(needle) ||
      row.id.toLowerCase().includes(needle)
    );
  }
  return rows;
}
