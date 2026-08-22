import { Check, Truck } from "lucide-react";
import { formatDateOnly, formatDateTime, formatPrice, formatSize } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_BADGE_CLASSES } from "@/lib/account/orderStatusLabels";
import type { OrderRecord, OrderStatus } from "@/types";
import CancelOrderButton from "@/components/account/CancelOrderButton";
import { normalizeOrderStatus } from "@/lib/orders/lifecycle";
import { getOrderPaymentPresentation, paymentToneClass } from "@/lib/orders/paymentPresentation";

// The customer-facing shipment timeline — a linear subset of the real
// status set (guest/cancelled orders are shown via their own badge instead,
// not folded into this line). Mirrors the same "pending/paid → Processing"
// collapse already used for the tab labels above.
const TIMELINE_STEPS: { status: OrderStatus; label: string }[] = [
  { status: "confirmed", label: "Confirmed" },
  { status: "preparing", label: "Preparing" },
  { status: "ready_for_pickup", label: "Ready for pickup" },
  { status: "shipped", label: "On the way" },
  { status: "fulfilled", label: "Delivered" },
];

function timelineIndexForStatus(status: OrderStatus): number {
  const normalized = normalizeOrderStatus(status);
  const i = TIMELINE_STEPS.findIndex((s) => s.status === normalized);
  return i === -1 ? 0 : i;
}

export default function OrderCard({
  order,
  showItems = true,
  showCancel = false,
}: {
  order: OrderRecord;
  showItems?: boolean;
  showCancel?: boolean;
}) {
  const brandNames = [...new Set(order.items.map((i) => i.brand))];
  const fulfillmentLabel =
    order.fulfillmentType === "mahaly_pool"
      ? brandNames.length > 1
        ? `${brandNames.join(", ")} · Fulfilled by Zakhnook`
        : `${brandNames[0] ?? "Zakhnook"} · Fulfilled by Zakhnook`
      : `${brandNames[0] ?? "Brand"} · packed by the brand, delivered by Zakhnook`;

  const activeIndex = timelineIndexForStatus(order.status);
  const showTimeline = order.status !== "cancelled";
  const payment = getOrderPaymentPresentation(order);

  return (
    <div className="rounded-[20px] border border-[var(--account-border)] bg-[var(--account-surface)] p-5 shadow-[var(--account-shadow)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold text-[var(--account-text)]">#{order.orderNumber}</p>
          <p className="mt-1 text-[12.5px] text-[var(--account-text-muted)]">
            {formatDateOnly(order.createdAt)} · {fulfillmentLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${ORDER_STATUS_BADGE_CLASSES[order.status]}`}
          >
            {ORDER_STATUS_LABELS[order.status]}
          </span>
          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ring-inset ${paymentToneClass(payment.tone)}`}>
            {payment.label}
          </span>
          <p className="text-[14px] font-semibold text-[var(--account-text)]">
            {order.subtotalUsd > 0 && formatPrice(order.subtotalUsd, "USD")}
            {order.subtotalUsd > 0 && order.subtotalEgp > 0 && " + "}
            {order.subtotalEgp > 0 && formatPrice(order.subtotalEgp, "EGP")}
          </p>
        </div>
      </div>

      {((order.refundedAmountCents ?? 0) > 0 || (order.refundPendingAmountCents ?? 0) > 0) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-stone-50 px-3 py-2 text-[11.5px] text-[var(--account-text-muted)]">
          {(order.refundedAmountCents ?? 0) > 0 && (
            <span>Confirmed refund: {formatPrice((order.refundedAmountCents ?? 0) / 100, "EGP")}</span>
          )}
          {(order.refundPendingAmountCents ?? 0) > 0 && (
            <span>Awaiting Paymob confirmation: {formatPrice((order.refundPendingAmountCents ?? 0) / 100, "EGP")}</span>
          )}
        </div>
      )}

      {(order.carrierName || order.trackingNumber || order.expectedDeliveryAt) && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-[var(--account-border)] bg-stone-50/70 px-3 py-3">
          <Truck aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-[var(--account-accent)]" />
          <div className="min-w-0 text-[11.5px] text-[var(--account-text-muted)]">
            <p className="font-semibold text-[var(--account-text)]">Delivery details</p>
            <p className="mt-1 break-words leading-5">
              {order.carrierName && <span>{order.carrierName}</span>}
              {order.carrierName && order.trackingNumber && <span> · </span>}
              {order.trackingNumber && <span>Tracking {order.trackingNumber}</span>}
              {(order.carrierName || order.trackingNumber) && order.expectedDeliveryAt && <br />}
              {order.expectedDeliveryAt && <span>Expected {formatDateTime(order.expectedDeliveryAt)}</span>}
            </p>
          </div>
        </div>
      )}

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
                <span className="mt-1 max-w-[72px] text-center text-[10px] leading-3 text-[var(--account-text-muted)]">
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
      {showCancel && (
        <div className="mt-4 border-t border-[var(--account-border)] pt-3">
          <CancelOrderButton masterOrderId={order.masterOrderId} />
        </div>
      )}
    </div>
  );
}
