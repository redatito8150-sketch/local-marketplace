import type { OrderItemRecord } from "@/types";
import { emailShell, orderItemsTable } from "@/lib/email/templates/shared";
import { formatPrice } from "@/lib/format";

// Sent to a brand owner (partner or non-partner alike) once an order is
// actually fulfilled/placed — never the whole order, only the line items
// that belong to THIS brand. A pooled (mahaly_pool) order can hold several
// partner brands' items in one orders row, so this is deliberately scoped
// per brand_slug, not per order — see lib/orders/notifyBrandOwnersOfNewOrder.ts.
//
// Field selection matches the existing Brand Portal orders scoping exactly
// (lib/data/brandPortal.ts's getOrdersForBrand): customer name + city/
// governorate, never phone/email/full address/payment details.
export interface BrandNewOrderInput {
  orderNumber: string;
  shippingName: string;
  shippingCity: string;
  shippingGovernorate: string;
  items: OrderItemRecord[];
}

function itemsSubtotalLine(items: OrderItemRecord[]): string {
  let egp = 0;
  let usd = 0;
  for (const item of items) {
    const lineTotal = item.price * item.quantity;
    if (item.currency === "EGP") egp += lineTotal;
    else usd += lineTotal;
  }
  return [usd > 0 ? formatPrice(usd, "USD") : null, egp > 0 ? formatPrice(egp, "EGP") : null]
    .filter(Boolean)
    .join(" + ");
}

export function brandNewOrderEmail(input: BrandNewOrderInput): { subject: string; html: string } {
  const itemCount = input.items.reduce((sum, item) => sum + item.quantity, 0);
  return {
    subject: `New order — #${input.orderNumber}`,
    html: emailShell(`
      <h1 style="font-size: 18px; margin: 0 0 8px;">You have a new order</h1>
      <p style="font-size: 14px; color: #4a463c; margin: 0 0 20px;">
        Order #${input.orderNumber} includes ${itemCount} item${itemCount === 1 ? "" : "s"} of yours.
      </p>
      ${orderItemsTable({ items: input.items })}
      <div style="margin-top: 16px; border-top: 1px solid #e5e0d8; padding-top: 12px; display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 15px;">
        <span>Your items total</span><span>${itemsSubtotalLine(input.items)}</span>
      </div>
      <p style="font-size: 13px; color: #8a8578; margin-top: 20px;">
        Customer: ${input.shippingName} — ${input.shippingCity}, ${input.shippingGovernorate}
      </p>
      <p style="font-size: 13px; color: #8a8578; margin-top: 4px;">
        Sign in to the Brand Portal to see full order details and manage fulfillment.
      </p>
    `),
  };
}
