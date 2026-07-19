import type { OrderRecord } from "@/types";
import { emailShell, orderItemsTable } from "@/lib/email/templates/shared";

export function orderShippedEmail(order: OrderRecord): { subject: string; html: string } {
  return {
    subject: `Your order is on its way — #${order.orderNumber}`,
    html: emailShell(`
      <h1 style="font-size: 18px; margin: 0 0 8px;">Good news, ${order.shippingName} — it's shipped!</h1>
      <p style="font-size: 14px; color: #4a463c; margin: 0 0 20px;">
        Order #${order.orderNumber} is on its way to:
        ${order.shippingAddress}, ${order.shippingCity}, ${order.shippingGovernorate}
      </p>
      ${orderItemsTable(order)}
    `),
  };
}
