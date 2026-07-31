import { Check } from "lucide-react";
import { formatPrice, formatSize } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_BADGE_CLASSES } from "@/lib/account/orderStatusLabels";
import type { OrderRecord, OrderStatus } from "@/types";

// The customer-facing shipment timeline — a linear subset of the real
// status set (guest/cancelled orders are shown via their own badge instead,
// not folded into this line). Mirrors the same "pending/paid → Processing"
// collapse already used for the tab labels above.
const TIMELINE_STEPS: { status: OrderStatus; label: string }[] = [
  { status: "paid", label: "Processing" },
  { status: "preparing", label: "Preparing" },
  { status: "shipped", label: "Shipped" },
  { status: "fulfilled", label: "Delivered" },
];

function timelineIndexForStatus(status: OrderStatus): number {
  if (status === "pending") return 0;
  const i = TIMELINE_STEPS.findIndex((s) => s.status === status);
  return i === -1 ? 0 : i;
}

export default function OrderCard({
  order,
  showItems = true,
}: {
  order: OrderRecord;
  showItems?: boolean;
}) {
  const brandNames = [...new Set(order.items.map((i) => i.brand))];
  const fulfillmentLabel =
    order.fulfillmentType === "mahaly_pool"
      ? brandNames.length > 1
        ? `${brandNames.join(", ")} · Fulfilled by Mahaly`
        : `${brandNames[0] ?? "Mahaly"} · Fulfilled by Mahaly`
      : `${brandNames[0] ?? "Brand"} · packed by the brand, delivered by Mahaly`;

  const activeIndex = timelineIndexForStatus(order.status);
  const showTimeline = order.status !== "cancelled";

  return (
    <div className="rounded-[20px] border border-[var(--account-border)] bg-[var(--account-surface)] p-5 shadow-[var(--account-shadow)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold text-[var(--account-text)]">#{order.orderNumber}</p>
          <p className="mt-1 text-[12.5px] text-[var(--account-text-muted)]">
            {new Date(order.createdAt).toLocaleDateString("en-US")} · {fulfillmentLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${ORDER_STATUS_BADGE_CLASSES[order.status]}`}
          >
            {ORDER_STATUS_LABELS[order.status]}
          </span>
          <p className="text-[14px] font-semibold text-[var(--account-text)]">
            {order.subtotalUsd > 0 && formatPrice(order.subtotalUsd, "USD")}
            {order.subtotalUsd > 0 && order.subtotalEgp > 0 && " + "}
            {order.subtotalEgp > 0 && formatPrice(order.subtotalEgp, "EGP")}
          </p>
        </div>
      </div>

      {showTimeline && (
        <div className="mt-4 flex items-center">
          {TIMELINE_STEPS.map((step, i) => (
            <div key={step.status} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold ${
                    i <= activeIndex
                      ? "bg-[var(--account-accent)] text-[var(--account-accent-foreground)]"
                      : "bg-[var(--account-border)] text-[var(--account-text-muted)]"
                  }`}
                >
                  {i < activeIndex ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
                </div>
                <span className="mt-1 whitespace-nowrap text-[10.5px] text-[var(--account-text-muted)]">
                  {step.label}
                </span>
              </div>
              {i < TIMELINE_STEPS.length - 1 && (
                <div
                  className={`mx-1 h-px flex-1 ${i < activeIndex ? "bg-[var(--account-accent)]" : "bg-[var(--account-border)]"}`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {showItems && (
        <div className="mt-4 space-y-2 divide-y divide-[var(--account-border)]">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between pt-2 first:pt-0">
              <p className="text-[13px] text-[var(--account-text-muted)]">
                {item.name} · Qty {item.quantity} · {formatSize(item.size)}
              </p>
              <p className="text-[13px] font-medium text-[var(--account-text)]">
                {formatPrice(item.price * item.quantity, item.currency)}
              </p>
            </div>
          ))}
          {order.shippingFeeEgp > 0 && (
            <div className="flex items-center justify-between pt-2 text-[12.5px] text-[var(--account-text-muted)]">
              <span>Delivery</span>
              <span>{formatPrice(order.shippingFeeEgp, "EGP")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
