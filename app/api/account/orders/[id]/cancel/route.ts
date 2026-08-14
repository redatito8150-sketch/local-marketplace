import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/supabase/requestUser";

function cancellationError(message: string): { status: number; error: string } {
  if (message.includes("MASTER_ORDER_NOT_FOUND") || message.includes("ORDER_NOT_OWNED")) {
    return { status: 404, error: "Order not found." };
  }
  if (message.includes("CARD_ORDER_REQUIRES_REFUND_REVIEW") || message.includes("PAID_ORDER_REQUIRES_REFUND_REVIEW")) {
    return { status: 409, error: "This paid order needs refund review. Contact support to cancel it." };
  }
  if (message.includes("ORDER_CAN_NO_LONGER_BE_CANCELLED")) {
    return { status: 409, error: "This order can no longer be cancelled because fulfillment has already progressed." };
  }
  return { status: 500, error: "We couldn't cancel this order. Please try again." };
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to cancel this order." }, { status: 401 });

  const { id } = await props.params;
  const { data, error } = await supabaseAdmin.rpc("cancel_customer_master_order", {
    p_master_order_id: id,
    p_user_id: user.id,
  });

  if (error) {
    const mapped = cancellationError(error.message);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
  return NextResponse.json({ result: data });
}
