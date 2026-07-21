import type { OrderRecord } from "@/types";
import { formatPrice, formatSize } from "@/lib/format";

// Small hand-rolled HTML/inline-CSS helpers shared by every order email —
// no template engine dependency, consistent with the project's lean
// footprint. Inline styles only, since most email clients strip <style>.

export function emailShell(bodyHtml: string): string {
  return `
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
  <div style="padding: 24px 0; border-bottom: 1px solid #e5e0d8;">
    <span style="font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: #D10506;">Mahaly</span>
  </div>
  <div style="padding: 24px 0;">
    ${bodyHtml}
  </div>
  <div style="padding: 24px 0; border-top: 1px solid #e5e0d8; font-size: 12px; color: #8a8578;">
    Mahaly — Local brands. Real stories. All in one place.
  </div>
</div>`;
}

export function orderItemsTable(order: Pick<OrderRecord, "items">): string {
  const rows = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #f0ede6;">
        <div style="font-weight: 600;">${item.name}</div>
        <div style="font-size: 12px; color: #8a8578;">${item.brand} · ${formatSize(item.size)}${item.color ? ` · ${item.color}` : ""} · Qty ${item.quantity}</div>
      </td>
      <td style="padding: 8px 0; border-bottom: 1px solid #f0ede6; text-align: right; white-space: nowrap;">
        ${formatPrice(item.price * item.quantity, item.currency)}
      </td>
    </tr>`
    )
    .join("");

  return `<table style="width: 100%; border-collapse: collapse; font-size: 14px;">${rows}</table>`;
}

export function orderTotalLine(order: OrderRecord): string {
  const parts: string[] = [];
  if (order.subtotalUsd > 0) parts.push(formatPrice(order.subtotalUsd, "USD"));
  if (order.subtotalEgp > 0) parts.push(formatPrice(order.subtotalEgp, "EGP"));
  return `<p style="text-align: right; font-weight: 700; margin-top: 12px;">Total: ${parts.join(" + ")}</p>`;
}
