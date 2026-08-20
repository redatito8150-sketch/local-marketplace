import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderForAdmin, getAuditLogsForEntity, getSiblingOrders } from "@/lib/data/admin";
import { formatDateTime, formatPrice, formatSize } from "@/lib/format";
import { ORDER_STATUS_LABELS, getValidOrderStatusOptions, orderStatusBadgeClass } from "@/lib/admin/statuses";
import StatusSelect from "@/components/admin/StatusSelect";
import InternalNotesField from "@/components/admin/InternalNotesField";
import CancelMasterOrderButton from "@/components/admin/CancelMasterOrderButton";
import RecordOrderRefundAction from "@/components/admin/RecordOrderRefundAction";
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
  const siblingOrders = await getSiblingOrders(order.masterOrderId, order.id);
  const cancellableCount =
    [order, ...siblingOrders].filter((o) => o.status !== "shipped" && o.status !== "fulfilled" && o.status !== "cancelled").length;

  // This order's own breakdown, straight from orders.subtotal_egp/
  // discount_amount_egp — Admin (unlike Brand Portal) is explicitly allowed
  // to read these order-wide fields directly, no per-brand scoping needed.
  const subtotalBeforeDiscounts = order.items.reduce(
    (sum, item) => (item.currency === "EGP" ? sum + (item.originalUnitPrice ?? item.price) * item.quantity : sum),
    0
  );
  const productVariantDiscount = Math.max(0, subtotalBeforeDiscounts - order.subtotalEgp);
  const subtotalAfterAllDiscounts = order.subtotalEgp - order.discountAmountEgp;
  const orderTotal = subtotalAfterAllDiscounts + order.shippingFeeEgp;

  // Full master-order total across every shipment from the same checkout —
  // only Admin sees this aggregate; Brand Portal never does.
  const masterOrderTotal = [
    { subtotalEgp: order.subtotalEgp, discountAmountEgp: order.discountAmountEgp, shippingFeeEgp: order.shippingFeeEgp },
    ...siblingOrders,
  ].reduce((sum, o) => sum + (o.subtotalEgp - o.discountAmountEgp + o.shippingFeeEgp), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-ink">
            Order #{order.orderNumber}
          </h1>
          <p className="mt-1 text-[13px] text-ink-soft/60">
            Purchase {order.masterOrderNumber} · {formatDateTime(order.createdAt)}
          </p>
        </div>
        <StatusSelect
          apiPath={`/api/admin/orders/${order.id}`}
          value={order.status}
          options={getValidOrderStatusOptions(order.status, order.fulfillmentType).map((s) => ({
            value: s,
            label: ORDER_STATUS_LABELS[s],
          }))}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl3 border border-stone-150 bg-white p-6">
          <h2 className="text-[15px] font-semibold text-ink">Items</h2>
          <div className="mt-4 divide-y divide-stone-150">
            {order.items.map((item) => {
              const showStrikethrough =
                item.discountSource != null && item.discountSource !== "none" && item.originalUnitPrice != null;
              return (
                <div key={item.id} className="flex items-center justify-between py-3 first:pt-0">
                  <div>
                    <p className="text-[13.5px] font-medium text-ink">{item.name}</p>
                    <p className="text-[12px] text-ink-soft/50">
                      {item.brand} · Qty {item.quantity} · {formatSize(item.size)}
                      {item.color ? ` · ${item.color}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    {showStrikethrough && (
                      <p className="text-[11.5px] text-ink-soft/40 line-through">
                        {formatPrice(item.originalUnitPrice!, item.currency)}
                      </p>
                    )}
                    <p className="text-[13.5px] font-semibold text-ink">
                      {formatPrice(item.price, item.currency)}
                      {item.quantity > 1 && (
                        <span className="ml-1 font-normal text-ink-soft/50">
                          × {item.quantity} = {formatPrice(item.price * item.quantity, item.currency)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 space-y-1.5 border-t border-stone-150 pt-4 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-ink-soft/60">Products subtotal</span>
              <span className="text-ink">{formatPrice(subtotalBeforeDiscounts, "EGP")}</span>
            </div>
            {productVariantDiscount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-ink-soft/60">Product/variant discounts</span>
                <span className="font-medium text-green-700">-{formatPrice(productVariantDiscount, "EGP")}</span>
              </div>
            )}
            {order.couponCode && (
              <div className="flex items-center justify-between">
                <span className="text-ink-soft/60">
                  Coupon <span className="font-medium text-ink">{order.couponCode}</span>
                </span>
                <span className="font-semibold text-green-700">-{formatPrice(order.discountAmountEgp, "EGP")}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-ink-soft/60">Subtotal after discounts</span>
              <span className="text-ink">{formatPrice(subtotalAfterAllDiscounts, "EGP")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-soft/60">Delivery fee</span>
              <span className="text-ink">{formatPrice(order.shippingFeeEgp, "EGP")}</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="font-medium text-ink">Order total (this shipment)</span>
              <span className="font-bold text-ink">{formatPrice(orderTotal, "EGP")}</span>
            </div>
            {siblingOrders.length > 0 && (
              <div className="flex items-center justify-between border-t border-stone-150 pt-2">
                <span className="font-medium text-ink">
                  Master order total ({siblingOrders.length + 1} shipments)
                </span>
                <span className="font-bold text-ink">{formatPrice(masterOrderTotal, "EGP")}</span>
              </div>
            )}
          </div>
        </div>

        <div className="h-fit rounded-xl3 border border-stone-150 bg-white p-6">
          <h2 className="text-[15px] font-semibold text-ink">Shipment</h2>
          <div className="mt-3 space-y-1.5 text-[13px] text-ink-soft/75">
            <p>
              <span className="font-medium text-ink">
                {order.fulfillmentType === "mahaly_pool" ? "Zakhnook pool" : "Brand direct"}
              </span>
              {order.brandSlug && ` — ${order.brandSlug}`}
            </p>
            <p>Delivery fee: {formatPrice(order.shippingFeeEgp, "EGP")}</p>
          </div>
          {siblingOrders.length > 0 && (
            <div className="mt-4 border-t border-stone-150 pt-3">
              <p className="text-[11.5px] font-medium text-ink-soft/60">
                Other shipments in purchase {order.masterOrderNumber}
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
              {cancellableCount > 0 && (
                <div className="mt-3">
                  <CancelMasterOrderButton
                    masterOrderId={order.masterOrderId}
                    masterOrderNumber={order.masterOrderNumber}
                    shipmentCount={siblingOrders.length + 1}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="h-fit rounded-xl3 border border-stone-150 bg-white p-6">
          <h2 className="text-[15px] font-semibold text-ink">Customer & delivery</h2>
          {order.userId && (
            <div className="mt-4 rounded-lg bg-stone-50 px-3.5 py-3 text-[13px] text-ink-soft/75">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-soft/50">Account customer</p>
              <p className="mt-1 font-medium text-ink">{order.accountName || "Account holder"}</p>
              <p>{order.accountEmail || "Email unavailable"}</p>
              {order.accountPhone && <p>{order.accountPhone}</p>}
            </div>
          )}
          <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-soft/50">Delivery recipient</p>
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

        <div className="h-fit rounded-xl3 border border-stone-150 bg-white p-6">
          <h2 className="text-[15px] font-semibold text-ink">Payment</h2>
          <div className="mt-3 space-y-2 text-[13px] text-ink-soft/75">
            <p>
              <span className="font-medium text-ink">
                {order.paymentMethod === "card" ? "Card (Paymob)" : "Cash on Delivery"}
              </span>
            </p>
            <p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                  order.paymentStatus === "paid"
                    ? "bg-green-50 text-green-700"
                    : order.paymentStatus === "refunded"
                    ? "bg-red-50 text-red-700"
                    : order.paymentStatus === "partially_refunded"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-stone-100 text-ink-soft/70"
                }`}
              >
                {order.paymentStatus === "paid"
                  ? "Paid"
                  : order.paymentStatus === "refunded"
                  ? "Refunded"
                  : order.paymentStatus === "partially_refunded"
                  ? "Partially refunded"
                  : "Unpaid"}
              </span>
            </p>
            {order.paymentAttemptId && (
              <p className="text-[11.5px] text-ink-soft/50" title={order.paymentAttemptId}>
                Paymob payment attempt: {order.paymentAttemptId.slice(0, 8)}…
              </p>
            )}
            {order.paymentMethod === "card" && order.paymentStatus !== "unpaid" && (
              <div className="mt-3 border-t border-stone-150 pt-3">
                <RecordOrderRefundAction
                  orderId={order.id}
                  paymentStatus={order.paymentStatus}
                />
              </div>
            )}
          </div>
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
