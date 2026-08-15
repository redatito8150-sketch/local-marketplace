import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { setProductLaunchPolicyShowNow } from "@/lib/admin/productLaunch";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";

// The authorized override for a when_stocked product still waiting on its
// first stock — expose it out of stock before stock arrives. Brand owner
// only (per item 3's role model — an assistant may pause/retire but not
// change launch policy); always the canonical
// set_product_launch_policy_show_now RPC, re-verified server-side against
// the real brand row, never a raw status/launch_policy PATCH.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner || owner.isImpersonating || !owner.brandId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (owner.accessLevel !== "owner") {
    return NextResponse.json({ error: "Only the brand owner can change how a product launches" }, { status: 403 });
  }

  const result = await setProductLaunchPolicyShowNow(params.id, owner.brandId, owner.user.id, owner.user.email ?? owner.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "PRODUCT_NOT_FOUND" ? 404 : 400 });
  }

  if (result.code === "LAUNCH_POLICY_UPDATED") {
    const productName = (result.before as { name?: string } | undefined)?.name ?? params.id;
    await logAudit({
      actorId: owner.user.id,
      actorLabel: owner.user.email ?? owner.user.id,
      entityType: "product",
      entityId: params.id,
      action: "product_launch_policy_updated",
      before: result.before,
      after: { launchPolicy: "show_now" },
      brandSlug: owner.brandSlug ?? undefined,
    });
    await notify(
      "product_updated",
      `Show now: ${productName}`,
      owner.brandName ?? "",
      { relatedEntityType: "product", relatedEntityId: params.id, actorLabel: owner.user.email ?? owner.user.id }
    );
  }

  return NextResponse.json({ ok: true, code: result.code, message: result.message, launchPolicy: result.launchPolicy });
}
