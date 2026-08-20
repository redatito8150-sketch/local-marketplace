import type { ProductInput } from "@/lib/admin/productValidation";

// Builds the products row payload (product-level fields only — variants
// and their option selections are persisted separately via
// lib/admin/variantPersistence.ts, since they need their own diff/
// reconciliation logic, not a plain insert/update).
export function buildProductPersistencePayload(
  body: ProductInput,
  overrides?: {
    status?: ProductInput["status"];
    publishDate?: string | null;
    // The existing row's publish_date, if this is an update — lets a
    // first-time transition to "published" auto-stamp "now" (Publish Date
    // is optional; the merchant shouldn't have to fill it in by hand), while
    // never resetting it on a later re-save of an already-published product.
    previousPublishDate?: string | null;
    // The existing row's status before this save (undefined on create) —
    // drives draft_started_at below. Distinct from `status` above, which
    // is the *target* the caller wants to force this save to.
    previousStatus?: ProductInput["status"];
    submittedBy?: string | null;
    clearReviewState?: boolean;
  }
) {
  const payload: Record<string, unknown> = {
    name: body.name,
    brand_id: body.brandId,
    audience: body.audience,
    product_type_id: body.productTypeId,
    collection_id: body.collectionId || null,
    fit: body.fit || null,
    // Structured multi-material composition — always sent (defaults to
    // empty), replacing the legacy single `material` text column below.
    materials: body.materials ?? [],
    price: body.price,
    discount_percent: body.discountPercent ?? null,
    discount_ends_at: body.discountEndsAt ?? null,
    currency: body.currency,
    image: body.image,
    // One authoritative product-detail order. The cover is always present,
    // followed by merchant-ordered gallery images and then any mapped Color
    // image not already represented by the same stable URL. The real limits
    // (1 cover, up to 3 gallery, 1 per color) are enforced by the editor's
    // ImageUploader instances; this is only a generous safety backstop.
    images: [...new Set([body.image, ...(body.images ?? []), ...Object.values(body.colorImages ?? {})].filter(Boolean))].slice(0, 50),
    description: body.description,
    details: body.details,
    care_instructions: body.careInstructions,
    model_height: body.modelHeight || null,
    model_wearing: body.modelWearing || null,
    status: overrides?.status ?? body.status,
    default_low_stock_threshold: body.defaultLowStockThreshold,
  };

  // launch_policy is a strict two-value DB enum (products_launch_policy_check)
  // — validateProductSections already rejects anything else once the
  // product is going public, so this is a plain passthrough of an
  // already-allowlisted value, never an arbitrary client string reaching
  // the database unchecked. Omitted for a Draft save (the column keeps its
  // existing/default value) so saving a draft can never reset an
  // already-chosen policy before the merchant has actually decided.
  //
  // CORRECTIVE PASS: also omitted once the product is ALREADY published
  // (overrides.previousStatus === "published") — this is the ordinary
  // create/edit PATCH path, which must never be able to mutate
  // launch_policy after initial publication (that's the dedicated,
  // owner-only "Show now" action's job — see set_product_launch_policy_show_now).
  // Without this, an assistant (or a crafted request to the generic PATCH
  // endpoint) could resubmit any launch_policy value on every ordinary
  // save; now the value is only ever included in the payload for a CREATE
  // or a genuine draft -> published first-publish transition, and the
  // database's own products_enforce_lifecycle_transition trigger is the
  // hard backstop even if this omission were ever bypassed.
  if (
    body.launchPolicy
    && (overrides?.status ?? body.status) !== "draft"
    && overrides?.previousStatus !== "published"
    && overrides?.previousStatus !== "paused"
  ) {
    payload.launch_policy = body.launchPolicy;
  }

  // Legacy single-material text, the old per-product Shipping & Returns
  // text, and "New"'s old manual is_new flag are never written by the
  // current editor — only include them if some other caller actually
  // provides a value, so an ordinary save never silently blanks out
  // pre-existing legacy data on an old product.
  if (body.material !== undefined) payload.material = body.material || null;
  if (body.shippingReturns !== undefined) payload.shipping_returns = body.shippingReturns;
  if (body.isNew !== undefined) payload.is_new = body.isNew;
  // Featured is now set only from the admin products list (never from this
  // editor) — omit entirely unless a caller explicitly overrides it, so
  // saving unrelated product changes can never silently un-feature it.
  if (body.featured !== undefined) payload.featured = body.featured;

  // Publish Date: an explicit value (merchant-entered or a server override)
  // always wins. Otherwise, only stamp "now" the first time the product
  // actually becomes published (no publish_date recorded yet) — a later
  // re-save while already published leaves the existing value untouched by
  // omitting the key entirely.
  const targetStatus = overrides?.status ?? body.status;
  if (overrides?.publishDate !== undefined) {
    payload.publish_date = overrides.publishDate;
  } else if (body.publishDate) {
    payload.publish_date = body.publishDate;
  } else if (targetStatus === "published" && !overrides?.previousPublishDate) {
    payload.publish_date = new Date().toISOString();
  }

  // Draft's 10-day window (lib/admin/expireDrafts.ts) is timed from the
  // moment a product *first* becomes a draft — re-saving while already a
  // draft must never reset that clock (else "Save as Draft" would let you
  // extend it forever), so this only ever stamps or clears, it never
  // touches an already-running clock.
  if (targetStatus === "draft" && overrides?.previousStatus !== "draft") {
    payload.draft_started_at = new Date().toISOString();
  } else if (targetStatus !== "draft") {
    payload.draft_started_at = null;
  }

  if (overrides?.submittedBy !== undefined) {
    payload.submitted_by = overrides.submittedBy;
  }
  if (overrides?.clearReviewState) {
    payload.pending_changes = null;
    payload.review_notes = null;
  }

  return payload;
}
