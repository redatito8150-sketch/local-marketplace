import { formatPrice } from "@/lib/format";
import type { BrandOrder } from "@/lib/data/brandPortal";
import { ORDER_STATUS_LABELS } from "@/lib/admin/statuses";
import type { OrderStatus } from "@/types";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash_on_delivery: "Cash on Delivery",
  card: "Card (Paymob)",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

// "This brand's portion" — every number here is derived only from this
// order's own `items` array, which lib/data/brandPortal.ts's
// getOrdersForBrand() has already scoped to this brand's own rows (via the
// brand_slug filter on order_items). A 'mahaly_pool' order can contain
// other brands' items too, so this deliberately never reads
// orders.subtotal_egp/discount_amount_egp directly — those would be the
// whole pooled shipment's totals across every brand in it, not this
// brand's own share. Only EGP lines are summed (coupons/discounts here are
// EGP-only today, matching the rest of the pricing snapshot system).
function summarize(order: BrandOrder) {
  let subtotalBeforeDiscounts = 0;
  let subtotalAfterItemDiscounts = 0;
  for (const item of order.items) {
    if (item.currency !== "EGP") continue;
    const original = item.originalUnitPrice ?? item.price;
    subtotalBeforeDiscounts += original * item.quantity;
    subtotalAfterItemDiscounts += item.price * item.quantity;
  }
  const productVariantDiscount = Math.max(0, subtotalBeforeDiscounts - subtotalAfterItemDiscounts);
  const couponDiscount = order.brandDiscountEgp;
  const subtotalAfterAllDiscounts = subtotalAfterItemDiscounts - couponDiscount;
  const total = subtotalAfterAllDiscounts + order.shippingFeeEgp;

  return { subtotalBeforeDiscounts, productVariantDiscount, couponDiscount, subtotalAfterAllDiscounts, total };
}

export default function BrandOrderPricingSummary({ order }: { order: BrandOrder }) {
  const s = summarize(order);

  return (
    <div className="mt-4 rounded-xl bg-[#fbf8f4] px-4 py-3 text-[11.5px]">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#8a7d73]">
        Order summary — your portion{order.masterOrderNumber ? ` of purchase ${order.masterOrderNumber}` : ""}
      </p>
      <dl className="space-y-1.5">
        <Row label="Products subtotal" value={formatPrice(s.subtotalBeforeDiscounts, "EGP")} />
        {s.productVariantDiscount > 0 && (
          <Row label="Product/variant discounts" value={`-${formatPrice(s.productVariantDiscount, "EGP")}`} muted />
        )}
        {s.couponDiscount > 0 && (
          <Row
            label={`Coupon discount${order.couponCode ? ` (${order.couponCode})` : ""}`}
            value={`-${formatPrice(s.couponDiscount, "EGP")}`}
            muted
          />
        )}
        <Row label="Subtotal after discounts" value={formatPrice(s.subtotalAfterAllDiscounts, "EGP")} />
        <Row label="Delivery fee" value={formatPrice(order.shippingFeeEgp, "EGP")} />
        <Row label="Order total (your portion)" value={formatPrice(s.total, "EGP")} strong />
        <Row label="Payment method" value={PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod} />
        <Row
          label="Payment status"
          value={PAYMENT_STATUS_LABELS[order.paymentStatus] ?? ORDER_STATUS_LABELS[order.paymentStatus as OrderStatus] ?? order.paymentStatus}
        />
        {order.refundedAmountCents > 0 && (
          <Row label="Confirmed refund" value={formatPrice(order.refundedAmountCents / 100, "EGP")} />
        )}
        {order.refundPendingAmountCents > 0 && (
          <Row label="Awaiting Paymob confirmation" value={formatPrice(order.refundPendingAmountCents / 100, "EGP")} muted />
        )}
      </dl>
    </div>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={muted ? "text-[#a68f68]" : "text-[#8a7d73]"}>{label}</dt>
      <dd className={strong ? "font-bold text-[#242424]" : muted ? "text-[#a68f68]" : "text-[#51473f]"}>{value}</dd>
    </div>
  );
}
