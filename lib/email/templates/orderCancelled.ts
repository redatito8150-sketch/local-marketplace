import type { OrderRecord } from "@/types";
import { emailShell, orderItemsTable } from "@/lib/email/templates/shared";

export function orderCancelledEmail(order: OrderRecord): { subject: string; html: string } {
  return {
    subject: `Order cancelled — #${order.orderNumber}`,
    html: emailShell(`
      <h1 style="font-size: 18px; margin: 0 0 8px;">Your order has been cancelled</h1>
      <p style="font-size: 14px; color: #4a463c; margin: 0 0 20px;">
        Order #${order.orderNumber} was cancelled. If you didn't request this or have any
        questions, please contact us.
      </p>
      ${orderItemsTable(order)}
    `),
  };
}
