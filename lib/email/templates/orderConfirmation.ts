import type { OrderRecord } from "@/types";
import { emailShell, orderItemsTable, orderTotalLine } from "@/lib/email/templates/shared";

export function orderConfirmationEmail(order: OrderRecord): { subject: string; html: string } {
  return {
    subject: `Order confirmed — #${order.orderNumber}`,
    html: emailShell(`
      <h1 style="font-size: 18px; margin: 0 0 8px;">Thanks for your order, ${order.shippingName}</h1>
      <p style="font-size: 14px; color: #4a463c; margin: 0 0 20px;">
        Order #${order.orderNumber} has been placed and is being prepared.
      </p>
      ${orderItemsTable(order)}
      ${orderTotalLine(order)}
      <p style="font-size: 13px; color: #8a8578; margin-top: 20px;">
        Shipping to: ${order.shippingAddress}, ${order.shippingCity}, ${order.shippingGovernorate}
      </p>
    `),
  };
}
