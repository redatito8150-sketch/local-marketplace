import type { OrderRecord } from "@/types";
import { formatPrice, formatSize } from "@/lib/format";

// Small hand-rolled HTML/inline-CSS helpers shared by every order email —
// no template engine dependency, consistent with the project's lean
// footprint. Inline styles only, since most email clients strip <style>.

export function emailShell(bodyHtml: string): string {
  return `
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
  <div style="padding: 24px 0; border-bottom: 1px solid #e5e0d8;">
    <span style="font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: #AC3935;">Zakhnook</span>
  </div>
  <div style="padding: 24px 0;">
    ${bodyHtml}
  </div>
  <div style="padding: 24px 0; border-top: 1px solid #e5e0d8; font-size: 12px; color: #8a8578;">
    Zakhnook — Local brands. Real stories. All in one place.
  </div>
</div>`;
}

export function orderItemsTable(order: Pick<OrderRecord, "items">): string {
  const rows = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #f0ede6; width: 56px;">
        <img src="${item.image}" alt="${item.name}" width="56" height="56" style="width: 56px; height: 56px; border-radius: 8px; object-fit: cover; display: block; background: #f0ede6;" />
      </td>
      <td style="padding: 10px 0 10px 12px; border-bottom: 1px solid #f0ede6;">
        <div style="font-weight: 600;">${item.name}</div>
        <div style="font-size: 12px; color: #8a8578; margin-top: 2px;">${item.brand} · ${formatSize(item.size)}${item.color ? ` · ${item.color}` : ""} · Qty ${item.quantity}</div>
      </td>
      <td style="padding: 10px 0; border-bottom: 1px solid #f0ede6; text-align: right; white-space: nowrap; vertical-align: top;">
        ${formatPrice(item.price * item.quantity, item.currency)}
      </td>
    </tr>`
    )
    .join("");

  return `<table style="width: 100%; border-collapse: collapse; font-size: 14px;">${rows}</table>`;
}

function summaryRow(label: string, value: string, options: { bold?: boolean; color?: string } = {}): string {
  return `<div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0; ${
    options.bold ? "font-weight: 700; font-size: 15px;" : ""
  } ${options.color ? `color: ${options.color};` : ""}"><span>${label}</span><span>${value}</span></div>`;
}

// Mirrors the checkout page's own Subtotal/Discount/Delivery/Total math
// exactly (app/checkout/page.tsx: Total (EGP) = subtotal.egp -
// discountEgp + shippingEgp) — an order's USD subtotal, if any, is its
// own separate total (no shipping/discount applies to it there either).
export function orderTotalLine(order: OrderRecord): string {
  const rows: string[] = [];
  if (order.subtotalUsd > 0) {
    rows.push(summaryRow("Total (USD)", formatPrice(order.subtotalUsd, "USD"), { bold: true }));
  }
  if (order.subtotalEgp > 0) {
    rows.push(summaryRow("Subtotal", formatPrice(order.subtotalEgp, "EGP")));
    if (order.discountAmountEgp > 0) {
      rows.push(
        summaryRow(
          order.couponCode ? `Discount (${order.couponCode})` : "Discount",
          `-${formatPrice(order.discountAmountEgp, "EGP")}`,
          { color: "#1a7a3c" }
        )
      );
    }
    rows.push(summaryRow("Delivery", order.shippingFeeEgp > 0 ? formatPrice(order.shippingFeeEgp, "EGP") : "Free"));
    const totalEgp = order.subtotalEgp - order.discountAmountEgp + order.shippingFeeEgp;
    rows.push(summaryRow("Total", formatPrice(totalEgp, "EGP"), { bold: true }));
  }
  return `<div style="margin-top: 16px; border-top: 1px solid #e5e0d8; padding-top: 12px;">${rows.join("")}</div>`;
}
