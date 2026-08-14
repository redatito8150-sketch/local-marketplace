import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import {
  archiveProduct,
  deleteArchivedProduct,
  deleteDraftProduct,
  getProductDeletionEligibility,
} from "@/lib/admin/productDeletion";

async function loadOwnedProduct(productId: string, brandId: string) {
  const { data } = await supabaseAdmin
    .from("products")
    .select("id, name, sku, image, status, brand_id, brand_slug")
    .eq("id", productId)
    .eq("brand_id", brandId)
    .maybeSingle();
  return data;
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner?.brandId) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const product = await loadOwnedProduct(id, owner.brandId);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  const eligibility = await getProductDeletionEligibility(id);
  return NextResponse.json({ eligibility });
}

type Action = "archive" | "delete_draft" | "delete_archived";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner?.brandId || owner.isImpersonating) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!checkRateLimit(`brand-product-lifecycle:${owner.user.id}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const product = await loadOwnedProduct(id, owner.brandId);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const action = body?.action as Action;
  if (!["archive", "delete_draft", "delete_archived"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Assistants may hide a product, but only the owner may erase data.
  if (action !== "archive" && owner.accessLevel !== "owner") {
    return NextResponse.json({ error: "Only the brand owner can permanently delete a product" }, { status: 403 });
  }
  if (action !== "archive" && body?.confirmationName !== product.name) {
    return NextResponse.json({ error: "Type the exact product name to confirm permanent deletion" }, { status: 400 });
  }

  const actorLabel = owner.user.email ?? owner.user.id;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const operationKey = typeof body?.operationKey === "string" ? body.operationKey.trim() : "";
  let result;
  if (action === "archive") {
    result = await archiveProduct(id, owner.brandId, owner.user.id, actorLabel);
  } else if (action === "delete_draft") {
    result = await deleteDraftProduct(id, owner.brandId, owner.user.id, actorLabel, reason, operationKey);
  } else {
    result = await deleteArchivedProduct(id, owner.brandId, owner.user.id, actorLabel, reason, operationKey);
  }

  if (!result.ok) {
    const status = result.code === "PRODUCT_NOT_FOUND" ? 404
      : result.code === "PRODUCT_NOT_OWNED" ? 403
      : result.code === "IDEMPOTENCY_KEY_REQUIRED" ? 400 : 409;
    return NextResponse.json({ error: result.message, code: result.code, blockers: result.blockers ?? [] }, { status });
  }

  await logAudit({
    actorId: owner.user.id,
    actorLabel,
    entityType: "product",
    entityId: id,
    action: action === "archive" ? "archive" : action === "delete_draft" ? "product_draft_deleted" : "product_deleted",
    before: product,
    after: { lifecycle: result.lifecycle, reason: reason || undefined },
    brandSlug: owner.brandSlug ?? undefined,
  });

  await notify(
    action === "archive" ? "product_archived" : "product_deleted",
    `${action === "archive" ? "Archived" : "Permanently deleted"}: ${product.name}`,
    reason || owner.brandName || "",
    { actorLabel }
  );

  return NextResponse.json(result);
}
