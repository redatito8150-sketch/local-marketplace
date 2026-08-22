import type { OrderRecord } from "@/types";
import { emailShell, orderItemsTable } from "@/lib/email/templates/shared";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function orderShippedEmail(order: OrderRecord): { subject: string; html: string } {
  return {
    subject: `Your order is on its way — #${order.orderNumber}`,
    html: emailShell(`
      <h1 style="font-size: 18px; margin: 0 0 8px;">Good news, ${order.shippingName} — it's shipped!</h1>
      <p style="font-size: 14px; color: #4a463c; margin: 0 0 20px;">
        Order #${order.orderNumber} is on its way to:
        ${order.shippingAddress}, ${order.shippingCity}, ${order.shippingGovernorate}
      </p>
      ${(order.carrierName || order.trackingNumber || order.expectedDeliveryAt) ? `
        <div style="background:#f7f3ef;border-radius:12px;padding:14px 16px;margin:0 0 20px;color:#4a463c;font-size:13px;line-height:1.6;">
          <strong>Delivery details</strong><br />
          ${order.carrierName ? `Carrier: ${escapeHtml(order.carrierName)}<br />` : ""}
          ${order.trackingNumber ? `Tracking: ${escapeHtml(order.trackingNumber)}<br />` : ""}
          ${order.expectedDeliveryAt ? `Expected: ${new Intl.DateTimeFormat("en-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }).format(new Date(order.expectedDeliveryAt))}` : ""}
        </div>
      ` : ""}
      ${orderItemsTable(order)}
    `),
  };
}
