import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBrandMembersForAdmin, getOrderForAdmin } from "@/lib/data/admin";
import { formatPrice } from "@/lib/format";
import { notifyUser } from "@/lib/notify";
import { sendEmail } from "@/lib/email/sendEmail";
import { paymentRefundConfirmedEmail } from "@/lib/email/templates/paymentRefundConfirmed";

export async function notifyOrderRefundConfirmed(input: {
  orderId: string;
  refundId: string;
  amountCents: number;
}): Promise<void> {
  const order = await getOrderForAdmin(input.orderId);
  if (!order) return;

  const customerTitle = `Refund confirmed for order ${order.orderNumber}`;
  const amount = formatPrice(input.amountCents / 100, "EGP");
  if (order.userId) {
    await notifyUser(order.userId, "payment_refund_confirmed", customerTitle, `Paymob confirmed ${amount}.`, {
      relatedEntityType: "order",
      relatedEntityId: order.id,
      deliveryKey: `refund-confirmed:${input.refundId}:customer:${order.userId}`,
    });
  }
  if (order.shippingEmail) {
    await sendEmail({
      to: order.shippingEmail,
      ...paymentRefundConfirmedEmail({ orderNumber: order.orderNumber, amountCents: input.amountCents, audience: "customer" }),
      idempotencyKey: `refund-confirmed-${input.refundId}-customer`,
    });
  }

  const { data: itemRows } = await supabaseAdmin
    .from("order_items")
    .select("brand_slug")
    .eq("order_id", order.id)
    .not("brand_slug", "is", null);
  const brandSlugs = [...new Set((itemRows ?? []).map((row) => row.brand_slug as string))];
  for (const brandSlug of brandSlugs) {
    const members = await getBrandMembersForAdmin(brandSlug);
    for (const owner of members?.owners ?? []) {
      await notifyUser(owner.id, "payment_refund_confirmed", customerTitle, `Paymob confirmed ${amount}.`, {
        relatedEntityType: "order",
        relatedEntityId: order.id,
        deliveryKey: `refund-confirmed:${input.refundId}:brand:${owner.id}`,
      });
      if (owner.email) {
        await sendEmail({
          to: owner.email,
          ...paymentRefundConfirmedEmail({ orderNumber: order.orderNumber, amountCents: input.amountCents, audience: "brand" }),
          idempotencyKey: `refund-confirmed-${input.refundId}-brand-${owner.id}`,
        });
      }
    }
  }
}
