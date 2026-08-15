import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { setProductLaunchPolicyShowNow } from "@/lib/admin/productLaunch";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";

// The authorized override for a when_stocked product still waiting on its
// first stock — expose it out of stock before stock arrives. Never bulk,
// never a raw status/launch_policy PATCH: always the canonical
// set_product_launch_policy_show_now RPC, which re-verifies ownership and
// is the only place launch_policy is ever allowed to change after publish.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffRole("manager");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await props.params;

  const result = await setProductLaunchPolicyShowNow(id, null, staff.user.id, staff.user.email ?? staff.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "PRODUCT_NOT_FOUND" ? 404 : 400 });
  }

  if (result.code === "LAUNCH_POLICY_UPDATED") {
    const productName = (result.before as { name?: string } | undefined)?.name ?? id;
    await logAudit({
      actorId: staff.user.id,
      actorLabel: staff.user.email ?? staff.user.id,
      entityType: "product",
      entityId: id,
      action: "product_launch_policy_updated",
      before: result.before,
      after: { launchPolicy: "show_now" },
    });
    await notify(
      "product_updated",
      `Show now: ${productName}`,
      "Now visible to customers even while out of stock.",
      { relatedEntityType: "product", relatedEntityId: id, actorLabel: staff.user.email ?? staff.user.id }
    );
  }

  return NextResponse.json({ ok: true, code: result.code, message: result.message, launchPolicy: result.launchPolicy });
}
