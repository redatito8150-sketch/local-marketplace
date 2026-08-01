import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderForAdmin, getAuditLogsForEntity, getSiblingOrders } from "@/lib/data/admin";
import { formatDateTime, formatPrice, formatSize } from "@/lib/format";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, orderStatusBadgeClass } from "@/lib/admin/statuses";
import StatusSelect from "@/components/admin/StatusSelect";
import InternalNotesField from "@/components/admin/InternalNotesField";
import type { OrderStatus } from "@/types";

export default async function AdminOrderDetailPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const [order, auditLogs] = await Promise.all([
    getOrderForAdmin(params.id),
    getAuditLogsForEntity("order", params.id),
  ]);
  if (!order) notFound();
  const siblingOrders = await getSiblingOrders(order.orderGroupId, order.id);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-ink">
            Order #{order.orderNumber}
          </h1>
          <p className="mt-1 text-[13px] text-ink-soft/60">
            {formatDateTime(order.createdAt)}
          </p>
        </div>
        <StatusSelect
          apiPath={`/api/admin/orders/${order.id}`}
          value={order.status}
          options={ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl3 border border-stone-150 bg-white p-6">
          <h2 className="text-[15px] font-semibold text-ink">Items</h2>
          <div className="mt-4 divide-y divide-stone-150">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-3 first:pt-0">
                <div>
                  <p className="text-[13.5px] font-medium text-ink">{item.name}</p>
                  <p className="text-[12px] text-ink-soft/50">
                    {item.brand} · Qty {item.quantity} · {formatSize(item.size)}
                    {item.color ? ` · ${item.color}` : ""}
                  </p>
                </div>
                <p className="text-[13.5px] font-semibold text-ink">
                  {formatPrice(item.price * item.quantity, item.currency)}
                </p>
              </div>
            ))}
          </div>
          {order.couponCode && (
            <div className="mt-4 flex items-center justify-between border-t border-stone-150 pt-4 text-[13px]">
              <span className="text-ink-soft/60">
                Coupon <span className="font-medium text-ink">{order.couponCode}</span>
              </span>
              <span className="font-semibold text-green-700">
                -{formatPrice(order.discountAmountEgp, "EGP")}
              </span>
            </div>
          )}
        </div>

        <div className="h-fit rounded-xl3 border border-stone-150 bg-white p-6">
          <h2 className="text-[15px] font-semibold text-ink">Shipment</h2>
          <div className="mt-3 space-y-1.5 text-[13px] text-ink-soft/75">
            <p>
              <span className="font-medium text-ink">
                {order.fulfillmentType === "mahaly_pool" ? "Mahaly pool" : "Brand direct"}
              </span>
              {order.brandSlug && ` — ${order.brandSlug}`}
            </p>
            <p>Delivery fee: {formatPrice(order.shippingFeeEgp, "EGP")}</p>
          </div>
          {siblingOrders.length > 0 && (
            <div className="mt-4 border-t border-stone-150 pt-3">
              <p className="text-[11.5px] font-medium text-ink-soft/60">
                Other shipments from this same checkout
              </p>
              <div className="mt-2 space-y-1.5">
                {siblingOrders.map((sib) => (
                  <Link
                    key={sib.id}
                    href={`/admin/orders/${sib.id}`}
                    className="flex items-center justify-between rounded-md bg-stone-50 px-2.5 py-1.5 text-[12px] hover:bg-stone-100"
                  >
                    <span className="font-medium text-ink">#{sib.orderNumber}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${orderStatusBadgeClass(sib.status)}`}
                    >
                      {ORDER_STATUS_LABELS[sib.status as OrderStatus] ?? sib.status}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="h-fit rounded-xl3 border border-stone-150 bg-white p-6">
          <h2 className="text-[15px] font-semibold text-ink">Shipping</h2>
          <div className="mt-4 space-y-1.5 text-[13px] text-ink-soft/75">
            <p className="font-medium text-ink">{order.shippingName}</p>
            <p>{order.shippingEmail}</p>
            <p>{order.shippingPhone}</p>
            <p>{order.shippingAddress}</p>
            <p>
              {order.shippingCity}, {order.shippingGovernorate}
            </p>
          </div>
          {!order.userId && (
            <p className="mt-4 rounded-md bg-stone-50 px-3 py-2 text-[12px] text-ink-soft/60">
              Guest checkout — no account linked to this order.
            </p>
          )}
        </div>

        <div className="rounded-xl3 border border-stone-150 bg-white p-6 lg:col-start-1">
          <h2 className="text-[15px] font-semibold text-ink">Internal Notes</h2>
          <p className="mt-1 text-[12px] text-ink-soft/50">
            Only visible to admin/staff — never shown to the customer.
          </p>
          <div className="mt-3">
            <InternalNotesField orderId={order.id} initialValue={order.internalNotes ?? ""} />
          </div>
        </div>

        <div className="h-fit rounded-xl3 border border-stone-150 bg-white p-6">
          <h2 className="text-[15px] font-semibold text-ink">Tracking timeline</h2>
          <p className="mt-1 text-[12px] text-ink-soft/50">
            The same shipment history the customer sees on their own order page.
          </p>
          <div className="mt-3 space-y-3">
            {(order.statusHistory ?? []).map((entry) => (
              <div key={entry.id} className="text-[12.5px]">
                <p className="font-medium capitalize text-ink">{ORDER_STATUS_LABELS[entry.status]}</p>
                <p className="text-[11.5px] text-ink-soft/50">
                  {formatDateTime(entry.createdAt)}
                </p>
              </div>
            ))}
            {(!order.statusHistory || order.statusHistory.length === 0) && (
              <p className="text-[12.5px] text-ink-soft/50">No tracking events yet.</p>
            )}
          </div>
        </div>

        <div className="h-fit rounded-xl3 border border-stone-150 bg-white p-6">
          <h2 className="text-[15px] font-semibold text-ink">Admin action log</h2>
          <div className="mt-3 space-y-3">
            {auditLogs.map((log) => (
              <div key={log.id} className="text-[12.5px]">
                <p className="font-medium text-ink capitalize">{log.action.replace("_", " ")}</p>
                <p className="text-[11.5px] text-ink-soft/50">
                  {log.actorLabel} · {formatDateTime(log.createdAt)}
                </p>
              </div>
            ))}
            {auditLogs.length === 0 && (
              <p className="text-[12.5px] text-ink-soft/50">No actions recorded yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
