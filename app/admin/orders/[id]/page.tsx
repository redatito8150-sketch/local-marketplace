import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft, Banknote, CircleCheck, Clock3, CreditCard, MapPin, PackageCheck, Truck, UserRound } from "lucide-react";
import { getAdminPurchaseForAdmin, getOrderForAdmin, getAuditLogsForEntity } from "@/lib/data/admin";
import { formatDateTime, formatPrice, formatSize } from "@/lib/format";
import { ORDER_STATUS_LABELS, getValidOrderStatusOptions, orderStatusBadgeClass } from "@/lib/admin/statuses";
import { getOrderPaymentPresentation, paymentToneClass } from "@/lib/orders/paymentPresentation";
import StatusSelect from "@/components/admin/StatusSelect";
import InternalNotesField from "@/components/admin/InternalNotesField";
import CancelMasterOrderButton from "@/components/admin/CancelMasterOrderButton";
import RecordOrderRefundAction from "@/components/admin/RecordOrderRefundAction";
import ReverseRefundAllocationButton from "@/components/admin/ReverseRefundAllocationButton";
import OrderItemThumbnail from "@/components/orders/OrderItemThumbnail";
import ShipmentTrackingForm from "@/components/admin/ShipmentTrackingForm";
import { buildAdminOrderActivity } from "@/lib/orders/adminOrderActivity";
import { getOrderActionOwner } from "@/lib/orders/lifecycle";

export default async function AdminOrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [order, auditLogs] = await Promise.all([
    getOrderForAdmin(params.id),
    getAuditLogsForEntity("order", params.id),
  ]);
  if (!order) notFound();

  const purchase = await getAdminPurchaseForAdmin(order.masterOrderId);
  const siblingOrders = purchase?.shipments.filter((shipment) => shipment.id !== order.id) ?? [];
  const cancellableCount = [order, ...siblingOrders].filter((item) => !["shipped", "fulfilled", "cancelled"].includes(item.status)).length;
  const subtotalBeforeDiscounts = order.items.reduce(
    (sum, item) => item.currency === "EGP" ? sum + (item.originalUnitPrice ?? item.price) * item.quantity : sum,
    0
  );
  const productVariantDiscount = Math.max(0, subtotalBeforeDiscounts - order.subtotalEgp);
  const subtotalAfterAllDiscounts = order.subtotalEgp - order.discountAmountEgp;
  const shipmentTotal = subtotalAfterAllDiscounts + order.shippingFeeEgp;
  const masterOrderTotal = purchase?.subtotalEgp ?? shipmentTotal;
  const payment = getOrderPaymentPresentation(order);
  const activity = buildAdminOrderActivity(order, auditLogs);
  const attentionReasons = purchase?.attentionReasons.filter((reason) => reason.shipmentId === order.id) ?? [];
  const actionOwner = getOrderActionOwner(order.status, order.fulfillmentType);

  return (
    <div className="mx-auto max-w-[1440px]">
      <Link href="/admin/orders" className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#75685f] transition-colors hover:text-[#C85956] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/20">
        <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />All orders
      </Link>

      <header className="mt-4 overflow-hidden rounded-[22px] border border-[#eadfd7] bg-white shadow-[0_10px_35px_rgba(72,50,36,0.045)]">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#C85956]">Order workspace</p>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${orderStatusBadgeClass(order.status)}`}>{ORDER_STATUS_LABELS[order.status]}</span>
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-[#242424] sm:text-[28px]">#{order.orderNumber}</h1>
            <p className="mt-1 text-[11px] text-[#81746b]">Purchase {order.masterOrderNumber} · Placed {formatDateTime(order.createdAt)}</p>
          </div>
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#9b8d82]">Update shipment status</span>
            <StatusSelect
              apiPath={`/api/admin/orders/${order.id}`}
              value={order.status}
              options={getValidOrderStatusOptions(order.status, order.fulfillmentType).map((status) => ({ value: status, label: ORDER_STATUS_LABELS[status] }))}
            />
          </div>
        </div>
        <div className="grid border-t border-[#eee7e1] bg-[#fcfaf8] sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCell label="Customer" value={order.shippingName} detail={order.userId ? order.accountEmail || "Account customer" : "Guest checkout"} icon={<UserRound className="h-4 w-4" />} />
          <SummaryCell label="Payment" value={payment.label} detail={payment.detail} icon={order.paymentMethod === "card" ? <CreditCard className="h-4 w-4" /> : <Banknote className="h-4 w-4" />} />
          <SummaryCell label="Fulfillment" value={order.fulfillmentType === "mahaly_pool" ? "Zakhnook fulfillment" : "Brand direct"} detail={order.brandSlug || `${order.items.length} variants`} icon={order.fulfillmentType === "mahaly_pool" ? <Truck className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />} />
          <SummaryCell label="Shipment total" value={formatPrice(shipmentTotal, "EGP")} detail={siblingOrders.length ? `${formatPrice(masterOrderTotal, "EGP")} across ${siblingOrders.length + 1} shipments` : "Single shipment purchase"} icon={<PackageCheck className="h-4 w-4" />} />
        </div>
      </header>

      {purchase && purchase.shipments.length > 1 && (
        <section className="mt-5 overflow-hidden rounded-[22px] border border-[#eadfd7] bg-white shadow-[0_10px_35px_rgba(72,50,36,0.04)]">
          <div className="flex flex-col gap-3 border-b border-[#eee7e1] bg-[#fcfaf8] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#C85956]">Purchase overview</p><h2 className="mt-1 text-sm font-extrabold text-[#302923]">{purchase.progress.label}</h2></div>
            <div className="flex items-center gap-3"><div className="h-1.5 w-28 overflow-hidden rounded-full bg-[#e9e2dc]"><span aria-hidden="true" className="block h-full rounded-full bg-[#C85956]" style={{ width: `${purchase.progress.percent}%` }} /></div><span className="text-[10px] font-bold tabular-nums text-[#81746b]">{purchase.progress.percent}%</span></div>
          </div>
          <div className="grid divide-y divide-[#eee7e1] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            {purchase.shipments.map((shipment) => {
              const reasons = purchase.attentionReasons.filter((reason) => reason.shipmentId === shipment.id);
              return <Link key={shipment.id} href={`/admin/orders/${shipment.id}`} aria-current={shipment.id === order.id ? "page" : undefined} className={`flex min-w-0 items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-[#fdfbf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/20 ${shipment.id === order.id ? "bg-[#fff8f6]" : ""}`}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-[11.5px] font-extrabold text-[#403730]">#{shipment.orderNumber}</p><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${orderStatusBadgeClass(shipment.status)}`}>{ORDER_STATUS_LABELS[shipment.status]}</span>{reasons[0] && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[9px] font-bold text-red-700"><AlertCircle aria-hidden="true" className="h-3 w-3" />{reasons[0].label}</span>}</div><p className="mt-1.5 truncate text-[10px] text-[#81746b]">{shipment.fulfillmentType === "mahaly_pool" ? "Zakhnook fulfillment" : `${shipment.brandSlug || "Brand"} direct`} · {shipment.items.length} variants</p></div><ArrowLeft aria-hidden="true" className="h-3.5 w-3.5 rotate-180 text-[#c1b5ac]" /></Link>;
            })}
          </div>
        </section>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="overflow-hidden rounded-[22px] border border-[#eadfd7] bg-white shadow-[0_10px_35px_rgba(72,50,36,0.04)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#eee7e1] bg-[#fcfaf8] px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#C85956]">Products</p><h2 className="mt-1 text-sm font-extrabold text-[#302923]">{order.items.length} ordered {order.items.length === 1 ? "variant" : "variants"}</h2></div><p className="text-[10.5px] text-[#8f8177]">This shipment only</p></div>
            <div className="divide-y divide-[#eee7e1] px-5">{order.items.map((item) => {
              const showStrikethrough =
                item.discountSource != null && item.discountSource !== "none" && item.originalUnitPrice != null;
              return (
                <div key={item.id} className="flex gap-4 py-4">
                  <OrderItemThumbnail image={item.image} name={`${item.name}${item.color ? ` in ${item.color}` : ""}`} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                      <div className="min-w-0"><p className="truncate text-[12.5px] font-extrabold text-[#403730]">{item.name}</p><p className="mt-1 text-[10.5px] text-[#887a70]">{item.brand} · {item.color || "No color"} · {formatSize(item.size)}</p></div>
                      <div className="flex-none sm:text-right">{showStrikethrough && <p className="text-[9.5px] text-[#a09287] line-through">{formatPrice(item.originalUnitPrice! * item.quantity, item.currency)}</p>}<p className={`text-[12px] font-extrabold ${showStrikethrough ? "text-[#C85956]" : "text-[#403730]"}`}>{formatPrice(item.price * item.quantity, item.currency)}</p></div>
                    </div>
                    <p className="mt-2 text-[10.5px] text-[#887a70]">Quantity {item.quantity}{item.quantity > 1 && <span> · {formatPrice(item.price, item.currency)} each</span>}</p>
                  </div>
                </div>
              );
            })}</div>
            <div className="border-t border-[#eee7e1] bg-[#fcfaf8] px-5 py-4"><div className="ml-auto max-w-[360px] space-y-2 text-[11px]"><PriceRow label="Products subtotal" value={formatPrice(subtotalBeforeDiscounts, "EGP")} />{productVariantDiscount > 0 && <PriceRow label="Product discounts" value={`−${formatPrice(productVariantDiscount, "EGP")}`} accent />}{order.discountAmountEgp > 0 && <PriceRow label={`Coupon${order.couponCode ? ` (${order.couponCode})` : ""}`} value={`−${formatPrice(order.discountAmountEgp, "EGP")}`} accent />}<PriceRow label="Delivery" value={order.shippingFeeEgp > 0 ? formatPrice(order.shippingFeeEgp, "EGP") : "Free"} /><div className="flex items-center justify-between border-t border-[#e8dfd8] pt-3 text-[13px]"><span className="font-extrabold text-[#403730]">Shipment total</span><span className="font-extrabold text-[#242424]">{formatPrice(shipmentTotal, "EGP")}</span></div></div></div>
          </section>

          <section className="overflow-hidden rounded-[22px] border border-[#eadfd7] bg-white shadow-[0_10px_35px_rgba(72,50,36,0.04)]">
            <div className="border-b border-[#eee7e1] bg-[#fcfaf8] px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#C85956]">Order activity</p><h2 className="mt-1 text-sm font-extrabold text-[#302923]">Lifecycle and admin history</h2></div>
            <div className="px-5 py-5">{activity.map((entry, index) => <div key={entry.id} className="grid grid-cols-[22px_1fr] gap-3"><div className="flex flex-col items-center"><span aria-hidden="true" className={`mt-0.5 h-3 w-3 rounded-full ring-4 ${index === 0 ? "bg-[#C85956] ring-[#f6e5e3]" : "bg-[#cfc4bb] ring-[#f4f0ec]"}`} />{index < activity.length - 1 && <span aria-hidden="true" className="min-h-10 w-px flex-1 bg-[#e8dfd8]" />}</div><div className="pb-5"><div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-start"><p className="text-[11.5px] font-bold text-[#4a4039]">{entry.title}</p><p className="flex-none text-[9.5px] text-[#94867c]">{formatDateTime(entry.createdAt)}</p></div><p className="mt-1 text-[10.5px] leading-4 text-[#81746b]">{entry.detail}</p><p className="mt-1 text-[9.5px] font-semibold text-[#a09287]">{entry.actor}{entry.actorRole ? ` · ${entry.actorRole}` : ""}</p></div></div>)}</div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-[22px] border border-[#eadfd7] bg-white p-5 shadow-[0_10px_35px_rgba(72,50,36,0.04)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#C85956]">Shipment control</p>
            <div className="mt-3 flex items-center justify-between gap-3"><div><p className="text-[12px] font-bold text-[#403730]">{order.fulfillmentType === "mahaly_pool" ? "Zakhnook pool" : "Brand direct"}</p><p className="mt-1 text-[10.5px] text-[#81746b]">{order.brandSlug || "Marketplace managed"}</p></div><span className={`rounded-full px-2.5 py-1 text-[9.5px] font-bold ${orderStatusBadgeClass(order.status)}`}>{ORDER_STATUS_LABELS[order.status]}</span></div>
            {attentionReasons.length > 0 ? <div className="mt-4 space-y-2 border-t border-[#eee7e1] pt-4">{attentionReasons.map((reason) => <div key={reason.code} className={`rounded-xl px-3 py-2.5 ${reason.tone === "critical" ? "bg-red-50 text-red-800" : reason.tone === "warning" ? "bg-amber-50 text-amber-900" : "bg-[#f8f4f0] text-[#5f534b]"}`}><p className="flex items-center gap-1.5 text-[10.5px] font-bold"><AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />{reason.label}</p><p className="mt-1 text-[9.5px] leading-4 opacity-80">{reason.detail}</p></div>)}</div> : actionOwner === "brand" ? <div className="mt-4 flex items-start gap-2 border-t border-[#eee7e1] pt-4 text-[#6f6259]"><Clock3 aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none" /><div><p className="text-[10.5px] font-bold">Waiting for brand team</p><p className="mt-1 text-[9.5px] leading-4 text-[#8e8177]">The next fulfillment transition belongs to the brand.</p></div></div> : <div className="mt-4 flex items-center gap-2 border-t border-[#eee7e1] pt-4 text-[10.5px] font-bold text-emerald-700"><CircleCheck aria-hidden="true" className="h-4 w-4" />No admin action required</div>}
            {cancellableCount > 0 && <div className="mt-4 border-t border-[#eee7e1] pt-4"><CancelMasterOrderButton masterOrderId={order.masterOrderId} masterOrderNumber={order.masterOrderNumber} shipmentCount={siblingOrders.length + 1} /></div>}
          </section>

          <section className="rounded-[22px] border border-[#eadfd7] bg-white p-5 shadow-[0_10px_35px_rgba(72,50,36,0.04)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#C85956]">Shipping & delivery</p>
            <p className="mt-1 text-[10.5px] leading-4 text-[#94867c]">Record the carrier reference and expected arrival for this shipment.</p>
            <div className="mt-4"><ShipmentTrackingForm orderId={order.id} carrierName={order.carrierName} trackingNumber={order.trackingNumber} expectedDeliveryAt={order.expectedDeliveryAt} updatedAt={order.updatedAt} /></div>
          </section>

          <section className="rounded-[22px] border border-[#eadfd7] bg-white p-5 shadow-[0_10px_35px_rgba(72,50,36,0.04)]">
            <div className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 flex-none text-[#C85956]" /><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#9b8d82]">Customer and delivery</p><p className="mt-2 text-[12px] font-bold text-[#403730]">{order.shippingName}</p><p className="mt-1 break-words text-[10.5px] leading-5 text-[#81746b]">{order.shippingEmail}<br />{order.shippingPhone}<br />{order.shippingAddress}<br />{order.shippingCity}, {order.shippingGovernorate}</p>{order.userId ? <p className="mt-3 rounded-lg bg-[#f8f4f0] px-3 py-2 text-[10px] text-[#75685f]">Account: {order.accountName || "Account customer"}{order.accountEmail ? ` · ${order.accountEmail}` : ""}</p> : <p className="mt-3 rounded-lg bg-[#f8f4f0] px-3 py-2 text-[10px] text-[#75685f]">Guest checkout · no account linked</p>}</div></div>
          </section>

          <section className="rounded-[22px] border border-[#eadfd7] bg-white p-5 shadow-[0_10px_35px_rgba(72,50,36,0.04)]">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#9b8d82]">Payment</p><p className="mt-2 text-[12px] font-bold text-[#403730]">{order.paymentMethod === "card" ? "Card · Paymob" : "Cash on delivery"}</p></div><span className={`rounded-full px-2.5 py-1 text-[9.5px] font-bold ring-1 ring-inset ${paymentToneClass(payment.tone)}`}>{payment.label}</span></div>
            {order.paymentAttemptId && <p className="mt-3 truncate font-mono text-[9.5px] text-[#94867c]" title={order.paymentAttemptId}>Attempt {order.paymentAttemptId}</p>}
            {(order.capturedAmountCents ?? 0) > 0 && <div className="mt-4 space-y-2 rounded-xl bg-[#f8f4f0] p-3 text-[10.5px]"><PriceRow label="Captured" value={formatPrice((order.capturedAmountCents ?? 0) / 100, "EGP")} /><PriceRow label="Confirmed refunded" value={formatPrice((order.refundedAmountCents ?? 0) / 100, "EGP")} />{(order.refundPendingAmountCents ?? 0) > 0 && <PriceRow label="Awaiting Paymob" value={formatPrice((order.refundPendingAmountCents ?? 0) / 100, "EGP")} accent />}</div>}
            {order.paymentMethod === "card" && order.paymentStatus !== "unpaid" && <div className="mt-4 border-t border-[#eee7e1] pt-4"><RecordOrderRefundAction orderId={order.id} paymentStatus={order.paymentStatus} pendingAmountCents={order.refundPendingAmountCents ?? 0} /></div>}
            {(order.refundHistory ?? []).length > 0 && <div className="mt-4 border-t border-[#eee7e1] pt-4"><p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#9b8d82]">Refund history</p><div className="mt-2 space-y-2">{(order.refundHistory ?? []).map((entry) => <div key={entry.id} className="rounded-xl border border-[#eee7e1] p-3 text-[10px]"><div className="flex items-center justify-between gap-2"><span className="font-bold text-[#403730]">{formatPrice(entry.amountCents / 100, "EGP")}</span><span className={entry.status === "confirmed" ? "text-emerald-700" : entry.status === "reversed" ? "text-red-700" : "text-amber-700"}>{entry.status === "confirmed" ? "Provider confirmed" : entry.status === "reversed" ? "Allocation reversed" : "Awaiting provider"}</span></div><p className="mt-1 text-[#94867c]">Requested {formatDateTime(entry.requestedAt)}</p>{entry.note && <p className="mt-1 leading-4 text-[#81746b]">{entry.note}</p>}{entry.status === "confirmed" && order.status !== "cancelled" && <ReverseRefundAllocationButton orderId={order.id} allocationId={entry.id} />}</div>)}</div></div>}
          </section>

          <section className="rounded-[22px] border border-[#eadfd7] bg-white p-5 shadow-[0_10px_35px_rgba(72,50,36,0.04)]"><p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#9b8d82]">Internal notes</p><p className="mt-1 text-[10.5px] leading-4 text-[#94867c]">Visible to admin and staff only.</p><div className="mt-3"><InternalNotesField orderId={order.id} initialValue={order.internalNotes ?? ""} /></div></section>
        </aside>
      </div>
    </div>
  );
}

function SummaryCell({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return <div className="flex gap-3 border-b border-[#eee7e1] px-5 py-4 last:border-b-0 sm:border-r sm:[&:nth-child(2)]:border-r-0 xl:border-b-0 xl:[&:nth-child(2)]:border-r xl:last:border-r-0"><span aria-hidden="true" className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-white text-[#C85956] shadow-sm">{icon}</span><div className="min-w-0"><p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#9b8d82]">{label}</p><p className="mt-1 truncate text-[11.5px] font-bold text-[#403730]">{value}</p><p className="mt-0.5 truncate text-[9.5px] text-[#94867c]">{detail}</p></div></div>;
}

function PriceRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={`flex items-center justify-between gap-3 ${accent ? "text-[#C85956]" : "text-[#75685f]"}`}><span>{label}</span><span className="font-bold">{value}</span></div>;
}
