import { formatPrice } from "@/lib/format";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);
}

export function paymentRefundConfirmedEmail(input: {
  orderNumber: string;
  amountCents: number;
  audience: "customer" | "brand";
}): { subject: string; html: string } {
  const orderNumber = escapeHtml(input.orderNumber);
  const amount = escapeHtml(formatPrice(input.amountCents / 100, "EGP"));
  const detail = input.audience === "customer"
    ? "Paymob confirmed that this refund was processed. Your bank may take additional time to display the returned amount."
    : "Paymob confirmed this refund against the order. This is a read-only financial update; no Brand Portal action is required.";
  return {
    subject: `Refund confirmed for order ${orderNumber}`,
    html: `<p>Refund confirmed for order <strong>${orderNumber}</strong>.</p><p>Amount: <strong>${amount}</strong></p><p>${detail}</p>`,
  };
}
