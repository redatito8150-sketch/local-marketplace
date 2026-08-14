import { supabaseAdmin } from "@/lib/supabase/admin";

// Canonical, database-authoritative product deletion eligibility. The
// database (private.compute_product_deletion_eligibility, supabase/
// migrations/20260814020000_product_deletion_lifecycle.sql) is the single
// source of truth — this file only types and forwards its jsonb result and
// wraps every lifecycle RPC it also defines. No business rule here is
// re-implemented in application code.
//
// Terminology: `products.status = 'archived'` internally is presented to
// users as "Retired" everywhere in this codebase's UI/API — the RPC names
// below use "retire"/"restore"/"schedule deletion" throughout, matching
// what a brand owner or admin actually sees, not the raw DB status value.
// Ordinary deletion no longer waits on admin approval: eligibility is
// database-authoritative, so scheduling a deletion either succeeds
// (creating a 7-day grace-period schedule) or fails outright with the
// current blockers — there is no "pending admin review" state to sit in.
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
  canRetire: boolean;
  canRestore: boolean;
  canDeleteImmediately: boolean;
  canScheduleDeletion: boolean;
  mustRetainHistory: boolean;
  hasActiveHold: boolean;
  blockers: DeletionBlocker[];
}

// Every mutating RPC returns this same envelope shape. `mediaUrls`/
// `mediaJobsQueued` are only ever populated by RPCs that actually
// hard-delete a product row (delete_draft_product, the cron executor) —
// purely informational; the RPC itself already enqueued the cleanup jobs
// transactionally, in the same transaction as the delete.
export interface DeletionRpcResult {
  ok: boolean;
  code: string;
  message: string;
  lifecycle?: ProductLifecycleState | "deleted";
  scheduleId?: string;
  scheduleState?: string;
  dueAt?: string;
  holdId?: string;
  scheduleStopped?: boolean;
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
    canRetire: Boolean(value.canRetire),
    canRestore: Boolean(value.canRestore),
    canDeleteImmediately: Boolean(value.canDeleteImmediately),
    canScheduleDeletion: Boolean(value.canScheduleDeletion),
    mustRetainHistory: Boolean(value.mustRetainHistory),
    hasActiveHold: Boolean(value.hasActiveHold),
    blockers: Array.isArray(value.blockers) ? value.blockers : [],
  };
}

// `ignoreScheduleId`: when computing eligibility on behalf of a specific
// deletion schedule (its own creation-time check, or the cron executor
// evaluating it at due time), pass that schedule's own id so its own
// still-active status is never counted as a blocker against itself.
export async function getProductDeletionEligibility(productId: string, ignoreScheduleId?: string): Promise<ProductDeletionEligibility> {
  const { data, error } = await supabaseAdmin.rpc("get_product_deletion_eligibility", {
    p_product_id: productId,
    p_ignore_schedule_id: ignoreScheduleId ?? null,
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
export function retireProduct(productId: string, brandId: string | null, actorId: string, actorLabel: string) {
  return callDeletionRpc("retire_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: actorId, p_actor_label: actorLabel });
}

export function restoreProduct(productId: string, brandId: string | null, actorId: string, actorLabel: string) {
  return callDeletionRpc("restore_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: actorId, p_actor_label: actorLabel });
}

export function deleteDraftProduct(productId: string, brandId: string | null, actorId: string, actorLabel: string) {
  return callDeletionRpc("delete_draft_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: actorId, p_actor_label: actorLabel });
}

// Only ever succeeds (creates a 7-day schedule) when the product is
// currently, fully eligible. If it isn't, no row is created at all — the
// caller gets the current blockers back and can try again once they clear.
export function scheduleProductDeletion(
  productId: string,
  brandId: string | null,
  actorId: string,
  actorLabel: string,
  reason: string,
  operationKey: string
) {
  return callDeletionRpc("schedule_product_deletion", {
    p_product_id: productId, p_brand_id: brandId, p_actor_id: actorId, p_actor_label: actorLabel,
    p_reason: reason, p_operation_key: operationKey,
  });
}

export function cancelProductDeletionSchedule(productId: string, brandId: string | null, actorId: string, actorLabel: string) {
  return callDeletionRpc("cancel_product_deletion_schedule", { p_product_id: productId, p_brand_id: brandId, p_actor_id: actorId, p_actor_label: actorLabel });
}

export function adminEmergencyHideProduct(productId: string, actorId: string, actorLabel: string, reason: string) {
  return callDeletionRpc("admin_emergency_hide_product", { p_product_id: productId, p_actor_id: actorId, p_actor_label: actorLabel, p_reason: reason });
}

export function applyProductDeletionHold(productId: string, actorId: string, actorLabel: string, reason: string) {
  return callDeletionRpc("apply_product_deletion_hold", { p_product_id: productId, p_actor_id: actorId, p_actor_label: actorLabel, p_reason: reason });
}

export function releaseProductDeletionHold(productId: string, actorId: string, actorLabel: string) {
  return callDeletionRpc("release_product_deletion_hold", { p_product_id: productId, p_actor_id: actorId, p_actor_label: actorLabel });
}

// The cron-invoked, batched, skip-locked executor. Never called from a
// user-facing route — only from the authenticated cron route.
export async function executeDueProductDeletions(batchSize = 25): Promise<{ completed: number; blocked: number; errored: number; results: unknown[] }> {
  const { data, error } = await supabaseAdmin.rpc("execute_due_product_deletions", { p_batch_size: batchSize });
  if (error) throw new Error(`executeDueProductDeletions() failed: ${error.message}`);
  return data as { completed: number; blocked: number; errored: number; results: unknown[] };
}

// `productId` is nullable — once a schedule reaches 'completed', the
// product row it referred to has actually been permanently deleted
// (product_id ON DELETE SET NULL). productName/productSku/productImage
// are immutable snapshots captured at scheduling time and refreshed right
// before deletion at execution time, so a completed schedule's history
// stays fully readable forever even though the live product is gone.
export interface DeletionScheduleRow {
  id: string;
  productId: string | null;
  productName: string;
  productSku: string | null;
  productImage: string | null;
  brandId: string;
  initiatedByLabel: string;
  scheduledAt: string;
  dueAt: string;
  reason: string | null;
  status: "scheduled" | "cancelled" | "blocked" | "completed";
  cancelledAt: string | null;
  cancelledByLabel: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  completedAt: string | null;
  blockerSnapshot: DeletionBlocker[];
  brandName?: string;
  brandSlug?: string;
  brandIsPartner?: boolean;
  hasActiveHold?: boolean;
}

interface DeletionScheduleSelectRow {
  id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  product_image: string | null;
  brand_id: string;
  initiated_by_label: string;
  scheduled_at: string;
  due_at: string;
  reason: string | null;
  status: DeletionScheduleRow["status"];
  cancelled_at: string | null;
  cancelled_by_label: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  completed_at: string | null;
  blocker_snapshot: DeletionBlocker[] | null;
  brands?: { name: string; slug: string; is_mahaly_partner: boolean } | null;
}

function mapDeletionScheduleRow(row: DeletionScheduleSelectRow): DeletionScheduleRow {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSku: row.product_sku,
    productImage: row.product_image,
    brandId: row.brand_id,
    initiatedByLabel: row.initiated_by_label,
    scheduledAt: row.scheduled_at,
    dueAt: row.due_at,
    reason: row.reason,
    status: row.status,
    cancelledAt: row.cancelled_at,
    cancelledByLabel: row.cancelled_by_label,
    blockedAt: row.blocked_at,
    blockedReason: row.blocked_reason,
    completedAt: row.completed_at,
    blockerSnapshot: row.blocker_snapshot ?? [],
    brandName: row.brands?.name,
    brandSlug: row.brands?.slug,
    brandIsPartner: row.brands?.is_mahaly_partner,
  };
}

export async function getActiveDeletionScheduleForProduct(productId: string): Promise<DeletionScheduleRow | null> {
  const { data, error } = await supabaseAdmin
    .from("product_deletion_schedules")
    .select("*, brands(name, slug, is_mahaly_partner)")
    .eq("product_id", productId)
    .eq("status", "scheduled")
    .maybeSingle();
  if (error) throw new Error(`getActiveDeletionScheduleForProduct(${productId}) failed: ${error.message}`);
  return data ? mapDeletionScheduleRow(data as DeletionScheduleSelectRow) : null;
}

export async function getDeletionScheduleById(scheduleId: string): Promise<DeletionScheduleRow | null> {
  const { data, error } = await supabaseAdmin
    .from("product_deletion_schedules")
    .select("*, brands(name, slug, is_mahaly_partner)")
    .eq("id", scheduleId)
    .maybeSingle();
  if (error) throw new Error(`getDeletionScheduleById(${scheduleId}) failed: ${error.message}`);
  return data ? mapDeletionScheduleRow(data as DeletionScheduleSelectRow) : null;
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

export interface DeletionScheduleListFilters {
  status?: DeletionScheduleRow["status"];
  brandId?: string;
  isPartner?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface DeletionScheduleListPage {
  rows: DeletionScheduleRow[];
  total: number;
  limit: number;
  offset: number;
}

interface AdminSearchDeletionSchedulesRow {
  id: string;
  productId: string | null;
  productName: string;
  productSku: string | null;
  productImage: string | null;
  brandId: string;
  initiatedByLabel: string;
  scheduledAt: string;
  dueAt: string;
  reason: string | null;
  status: DeletionScheduleRow["status"];
  cancelledAt: string | null;
  cancelledByLabel: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  completedAt: string | null;
  blockerSnapshot: DeletionBlocker[] | null;
  brandName: string;
  brandSlug: string;
  brandIsPartner: boolean;
  hasActiveHold: boolean;
}

// The admin deletion-schedules operational page — a single database-level
// paginated + filtered query (private.admin_search_deletion_schedules).
// Status/brand/partner and text search are all applied inside Postgres
// before LIMIT/OFFSET — never loads more rows into memory than the
// current page needs. This is NOT an approval queue: every row here is
// either an active 7-day countdown, or already-resolved history
// (cancelled/blocked/completed) — there is nothing for an admin to
// "approve."
export async function listDeletionSchedules(filters: DeletionScheduleListFilters = {}): Promise<DeletionScheduleListPage> {
  const { data, error } = await supabaseAdmin.rpc("admin_search_deletion_schedules", {
    p_status: filters.status ?? null,
    p_brand_id: filters.brandId ?? null,
    p_is_partner: typeof filters.isPartner === "boolean" ? filters.isPartner : null,
    p_search: filters.search ?? null,
    p_limit: filters.limit ?? 25,
    p_offset: filters.offset ?? 0,
  });
  if (error) throw new Error(`listDeletionSchedules() failed: ${error.message}`);

  const result = data as { rows: AdminSearchDeletionSchedulesRow[]; total: number; limit: number; offset: number };
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
      initiatedByLabel: row.initiatedByLabel,
      scheduledAt: row.scheduledAt,
      dueAt: row.dueAt,
      reason: row.reason,
      status: row.status,
      cancelledAt: row.cancelledAt,
      cancelledByLabel: row.cancelledByLabel,
      blockedAt: row.blockedAt,
      blockedReason: row.blockedReason,
      completedAt: row.completedAt,
      blockerSnapshot: row.blockerSnapshot ?? [],
      brandName: row.brandName,
      brandSlug: row.brandSlug,
      brandIsPartner: row.brandIsPartner,
      hasActiveHold: row.hasActiveHold,
    })),
  };
}

// A single Retired product row from the paginated Retired-tab search
// below — eligibility is computed inline by the same canonical function
// every mutation RPC uses, never re-derived in application code.
export interface RetiredProductRow {
  id: string;
  name: string;
  sku: string;
  image: string;
  brandId: string;
  brandName: string;
  eligibility: ProductDeletionEligibility;
  activeSchedule: { id: string; status: string; dueAt: string } | null;
}

export interface RetiredProductListPage {
  rows: RetiredProductRow[];
  total: number;
  limit: number;
  offset: number;
}

// Paginated "Retired" tab for both Brand Portal (pass brandId) and Admin
// (omit brandId for all brands) — private.search_retired_products applies
// status = 'archived', search, and LIMIT/OFFSET entirely inside Postgres,
// so this never loads a full catalog into memory just to show one page of
// Retired products.
export async function listRetiredProducts(filters: { brandId?: string; search?: string; limit?: number; offset?: number } = {}): Promise<RetiredProductListPage> {
  const { data, error } = await supabaseAdmin.rpc("search_retired_products", {
    p_brand_id: filters.brandId ?? null,
    p_search: filters.search ?? null,
    p_limit: filters.limit ?? 25,
    p_offset: filters.offset ?? 0,
  });
  if (error) throw new Error(`listRetiredProducts() failed: ${error.message}`);

  const result = data as { rows: RetiredProductRow[]; total: number; limit: number; offset: number };
  return result;
}
