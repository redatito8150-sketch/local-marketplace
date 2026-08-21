export type PaymentTone = "success" | "pending" | "partial" | "refunded";

export function getOrderPaymentPresentation(order: {
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  refundedAmountCents?: number;
  refundPendingAmountCents?: number;
}): { label: string; detail: string; tone: PaymentTone } {
  if (order.paymentStatus === "refunded") {
    return { label: "Refunded", detail: "Payment refunded", tone: "refunded" };
  }
  if (order.paymentStatus === "partially_refunded") {
    return { label: "Partially refunded", detail: "Part of the card payment was refunded", tone: "partial" };
  }
  if ((order.refundPendingAmountCents ?? 0) > 0) {
    return { label: "Refund pending", detail: "Waiting for confirmation from the payment provider", tone: "pending" };
  }
  if (order.paymentMethod === "card") {
    return order.paymentStatus === "paid"
      ? { label: "Card paid", detail: "Paid online by card", tone: "success" }
      : { label: "Card pending", detail: "Card payment not confirmed", tone: "pending" };
  }
  if (order.paymentStatus === "paid" || order.status === "fulfilled") {
    return { label: "Cash collected", detail: "Collected on delivery", tone: "success" };
  }
  return { label: "Collect on delivery", detail: "Cash due on delivery", tone: "pending" };
}

export function paymentToneClass(tone: PaymentTone) {
  if (tone === "success") return "bg-emerald-50 text-emerald-700 ring-emerald-600/15";
  if (tone === "partial") return "bg-amber-50 text-amber-800 ring-amber-600/15";
  if (tone === "refunded") return "bg-slate-100 text-slate-700 ring-slate-500/15";
  return "bg-amber-50 text-amber-800 ring-amber-600/15";
}
