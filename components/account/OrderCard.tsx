import { formatPrice, formatSize } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_BADGE_CLASSES } from "@/lib/account/orderStatusLabels";
import type { OrderRecord } from "@/types";

export default function OrderCard({
  order,
  showItems = true,
}: {
  order: OrderRecord;
  showItems?: boolean;
}) {
  return (
    <div className="rounded-xl3 border border-stone-150 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold text-ink">#{order.orderNumber}</p>
          <p className="mt-1 text-[12.5px] text-ink-soft/50">
            {new Date(order.createdAt).toLocaleDateString("en-US")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${ORDER_STATUS_BADGE_CLASSES[order.status]}`}
          >
            {ORDER_STATUS_LABELS[order.status]}
          </span>
          <p className="text-[14px] font-semibold text-ink">
            {order.subtotalUsd > 0 && formatPrice(order.subtotalUsd, "USD")}
            {order.subtotalUsd > 0 && order.subtotalEgp > 0 && " + "}
            {order.subtotalEgp > 0 && formatPrice(order.subtotalEgp, "EGP")}
          </p>
        </div>
      </div>

      {showItems && (
        <div className="mt-4 space-y-2 divide-y divide-stone-150">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between pt-2 first:pt-0">
              <p className="text-[13px] text-ink-soft/80">
                {item.name} · Qty {item.quantity} · {formatSize(item.size)}
              </p>
              <p className="text-[13px] font-medium text-ink">
                {formatPrice(item.price * item.quantity, item.currency)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
