import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CircleCheck,
  Clock3,
  CreditCard,
  Download,
  MapPin,
  PackageCheck,
  Search,
  Truck,
} from "lucide-react";
import AutoSubmitForm from "@/components/dashboard/AutoSubmitForm";
import { DashboardFilterField, DashboardMoreFilters, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import DateRangePicker from "@/components/ui/DateRangePicker";
import OrderDrawerShell from "@/components/orders/OrderDrawerShell";
import OrderItemThumbnail from "@/components/orders/OrderItemThumbnail";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, orderStatusBadgeClass } from "@/lib/admin/statuses";
import { formatDateOnly, formatDateTime, formatPrice, formatSize } from "@/lib/format";
import { getOrderActionOwner, normalizeOrderStatus } from "@/lib/orders/lifecycle";
import { getOrderPaymentPresentation, paymentToneClass } from "@/lib/orders/paymentPresentation";
import type {
  AdminOrderAttentionReason,
  AdminOrderQueue,
  AdminPurchaseGroup,
} from "@/lib/orders/adminOrderFilters";
import type { OrderRecord, OrderStatus } from "@/types";

type Params = { q?: string; queue?: string; status?: string; brand?: string; from?: string; to?: string; page?: string; order?: string };

const QUEUES: Array<{ key: AdminOrderQueue; label: string; tone: string }> = [
  { key: "all", label: "All purchases", tone: "bg-[#C85956]" },
  { key: "attention", label: "Needs action", tone: "bg-red-500" },
  { key: "active", label: "In progress", tone: "bg-amber-400" },
  { key: "fulfilled", label: "Delivered", tone: "bg-emerald-500" },
  { key: "cancelled", label: "Cancelled", tone: "bg-[#a9bbc5]" },
];

function purchaseTotal(group: AdminPurchaseGroup) {
  const parts: string[] = [];
  if (group.subtotalUsd > 0) parts.push(formatPrice(group.subtotalUsd, "USD"));
  if (group.subtotalEgp > 0) parts.push(formatPrice(group.subtotalEgp, "EGP"));
  return parts.join(" + ") || formatPrice(0, "EGP");
}

function shipmentTotal(order: OrderRecord) {
  return order.subtotalEgp - order.discountAmountEgp + order.shippingFeeEgp;
}

function attentionClass(reason: AdminOrderAttentionReason) {
  if (reason.tone === "critical") return "bg-red-50 text-red-700 ring-red-100";
  if (reason.tone === "warning") return "bg-amber-50 text-amber-800 ring-amber-100";
  return "bg-[#f4f0ec] text-[#6f6259] ring-[#ebe2da]";
}

function orderForGroup(group: AdminPurchaseGroup, params: Params, activeQueue: AdminOrderQueue) {
  if (activeQueue === "attention" && group.attentionShipmentId) return group.attentionShipmentId;
  if (params.status) {
    const shipment = group.shipments.find((order) => normalizeOrderStatus(order.status) === params.status);
    if (shipment) return shipment.id;
  }
  if (params.brand) {
    const shipment = group.shipments.find((order) => order.items.some((item) => item.brand === params.brand));
    if (shipment) return shipment.id;
  }
  return group.shipments[0]?.id;
}

export default function AdminOrdersWorkspace({ groups, selectedPurchase, selectedShipmentId, counts, brands, params, page, totalPages, totalPurchases }: {
  groups: AdminPurchaseGroup[];
  selectedPurchase: AdminPurchaseGroup | null;
  selectedShipmentId?: string;
  counts: Record<AdminOrderQueue, number>;
  brands: string[];
  params: Params;
  page: number;
  totalPages: number;
  totalPurchases: number;
}) {
  const activeQueue = (QUEUES.some((queue) => queue.key === params.queue) ? params.queue : "all") as AdminOrderQueue;
  const hrefFor = (changes: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams();
    Object.entries({ ...params, ...changes }).forEach(([key, value]) => {
      if (value != null && value !== "" && !(key === "queue" && value === "all")) next.set(key, String(value));
    });
    return `/admin/orders${next.size ? `?${next}` : ""}`;
  };
  const closeHref = hrefFor({ order: undefined });
  const activeMoreFilters = Boolean(params.status || params.brand);
  const exportParams = new URLSearchParams();
  for (const key of ["q", "queue", "status", "brand", "from", "to"] as const) {
    const value = params[key];
    if (value && !(key === "queue" && value === "all")) exportParams.set(key, value);
  }
  const exportHref = `/api/admin/orders/export${exportParams.size ? `?${exportParams}` : ""}`;

  return (
    <>
      <AutoSubmitForm action="/admin/orders" className="mt-6">
        {activeQueue !== "all" && <input type="hidden" name="queue" value={activeQueue} />}
        <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
          <label className="relative order-[1] min-w-0 xl:w-[320px] xl:flex-none">
            <span className="sr-only">Search orders</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9d8f84]" />
            <input name="q" defaultValue={params.q ?? ""} autoComplete="off" maxLength={160} placeholder="Purchase, order, customer or product…" className="h-10 w-full rounded-xl border border-[#e5ddd5] bg-white pl-10 pr-4 text-[11.5px] font-semibold text-[#51473f] outline-none transition-colors placeholder:font-normal placeholder:text-[#9b8d82] hover:border-[#d8ccc3] focus-visible:border-[#ded6cf] focus-visible:ring-2 focus-visible:ring-[#e7e4de]/70" />
          </label>
          <nav aria-label="Order queue" className="order-[2] flex h-10 min-w-0 overflow-x-auto rounded-xl border border-[#e7ddd5] bg-white">
            {QUEUES.map((queue) => {
              const active = activeQueue === queue.key;
              return (
                <Link key={queue.key} href={hrefFor({ queue: queue.key, page: undefined, order: undefined })} aria-current={active ? "page" : undefined} className={`inline-flex h-full flex-none items-center gap-1.5 border-r border-[#eee7e1] px-3 text-[10.5px] font-bold transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/20 ${active ? "bg-[#f6e5e3] text-[#A94442]" : "text-[#6f635a] hover:bg-[#fcfaf8] hover:text-[#A94442]"}`}>
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${queue.tone}`} />
                  {queue.label}<span className="tabular-nums text-[9.5px] opacity-70">{counts[queue.key]}</span>
                </Link>
              );
            })}
          </nav>
          <DateRangePicker key={`${params.from ?? ""}-${params.to ?? ""}`} defaultFrom={params.from} defaultTo={params.to} compact label="Order date range" />
          <DashboardMoreFilters label="More order filters" active={activeMoreFilters}>
            <DashboardFilterField label="Status"><select name="status" defaultValue={params.status ?? ""} className={`${dashboardFilterControl} w-full`}><option value="">All statuses</option>{ORDER_STATUSES.map((status) => <option key={status} value={status}>{ORDER_STATUS_LABELS[status]}</option>)}</select></DashboardFilterField>
            <DashboardFilterField label="Brand"><select name="brand" defaultValue={params.brand ?? ""} className={`${dashboardFilterControl} w-full`}><option value="">All brands</option>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select></DashboardFilterField>
          </DashboardMoreFilters>
        </div>
      </AutoSubmitForm>

      <section className="mt-4 overflow-hidden rounded-[22px] border border-[#eadfd7] bg-white shadow-[0_10px_35px_rgba(72,50,36,0.045)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#eee7e1] bg-[#fcfaf8] px-5 py-3">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8d7f75]">Purchase queue</p><p className="mt-0.5 text-[10.5px] text-[#9a8b80]">{totalPurchases} matching {totalPurchases === 1 ? "purchase" : "purchases"}</p></div>
          <Link href={exportHref} prefetch={false} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e4d9d1] bg-white px-3 text-[10.5px] font-bold text-[#5d5148] transition-colors hover:border-[#C85956]/30 hover:text-[#C85956] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/20"><Download aria-hidden="true" className="h-3.5 w-3.5" />Export CSV</Link>
        </div>

        {groups.length ? (
          <div className="divide-y divide-[#eee7e1]">
            {groups.map((group) => {
              const visibleItems = group.items.slice(0, 2);
              const targetOrderId = orderForGroup(group, params, activeQueue);
              const primaryReason = group.attentionReasons[0];
              const firstShipment = group.shipments[0];
              const waitingOnBrand = group.shipments.some((shipment) => getOrderActionOwner(shipment.status, shipment.fulfillmentType) === "brand");
              const payment = getOrderPaymentPresentation(firstShipment);
              const mixedPayment = group.shipments.some((shipment) => shipment.paymentMethod !== firstShipment.paymentMethod || shipment.paymentStatus !== firstShipment.paymentStatus);
              return (
                <Link key={group.id} href={hrefFor({ order: targetOrderId, page })} scroll={false} aria-label={`Preview purchase ${group.number}`} className="group relative block px-4 py-4 outline-none transition-colors hover:bg-[#fdfbf9] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/25 sm:px-5">
                  <span aria-hidden="true" className={`absolute bottom-4 left-0 top-4 w-[3px] rounded-r-full ${primaryReason?.tone === "critical" ? "bg-red-400" : group.progress.delivered === group.progress.total ? "bg-emerald-400" : group.progress.cancelled === group.progress.total ? "bg-red-300" : "bg-[#C85956]"}`} />
                  <div className="grid gap-4 xl:grid-cols-[minmax(185px,.75fr)_minmax(310px,1.35fr)_minmax(235px,.9fr)_minmax(145px,.55fr)] xl:items-center">
                    <div className="min-w-0"><p className="text-[13px] font-extrabold text-[#242424]">{group.number}</p><p className="mt-1.5 truncate text-[11px] text-[#71645b]">{group.customerName} · {group.customerCity}</p><p className="mt-1 text-[10.5px] text-[#a09287]">{formatDateOnly(group.createdAt)} · Updated {formatDateOnly(group.updatedAt)}</p></div>
                    <div className="space-y-2">{visibleItems.map((item) => <div key={item.id} className="flex items-center gap-3"><OrderItemThumbnail image={item.image} name={item.name} /><div className="min-w-0"><p className="truncate text-[11.5px] font-bold text-[#4b413a]">{item.name}</p><p className="mt-1 truncate text-[10.5px] text-[#8e8177]">{item.brand} · {item.color || "No color"} · {formatSize(item.size)} · Qty {item.quantity}</p></div></div>)}{group.items.length > 2 && <p className="pl-[52px] text-[10.5px] font-bold text-[#C85956]">+{group.items.length - 2} more variants</p>}</div>
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-3"><p className="truncate text-[11px] font-extrabold text-[#4b413a]">{group.progress.label}</p><span className="flex-none text-[9.5px] font-bold tabular-nums text-[#8d7f75]">{group.progress.percent}%</span></div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eee8e2]"><span aria-hidden="true" className="block h-full rounded-full bg-[#C85956]" style={{ width: `${group.progress.percent}%` }} /></div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {primaryReason ? <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9.5px] font-bold ring-1 ring-inset ${attentionClass(primaryReason)}`}><AlertCircle aria-hidden="true" className="h-3 w-3" />{primaryReason.label}</span> : waitingOnBrand ? <span className="inline-flex items-center gap-1 rounded-full bg-[#f4f0ec] px-2 py-1 text-[9.5px] font-bold text-[#6f6259] ring-1 ring-inset ring-[#ebe2da]"><Clock3 aria-hidden="true" className="h-3 w-3" />Waiting for brand</span> : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9.5px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-100"><CircleCheck aria-hidden="true" className="h-3 w-3" />No admin action</span>}
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9.5px] font-bold ring-1 ring-inset ${paymentToneClass(payment.tone)}`}>{firstShipment.paymentMethod === "card" ? <CreditCard aria-hidden="true" className="h-3 w-3" /> : <Banknote aria-hidden="true" className="h-3 w-3" />}{mixedPayment ? "Mixed payment" : payment.label}</span>
                      </div>
                      <p className="mt-2 text-[10px] font-semibold text-[#81746b]">{group.shipments.length} {group.shipments.length === 1 ? "shipment" : "shipments"} · {group.items.length} variants</p>
                    </div>
                    <div className="flex items-center justify-between gap-4 xl:justify-end"><div className="xl:text-right"><p className="text-[13px] font-extrabold text-[#242424]">{purchaseTotal(group)}</p><p className="mt-1 text-[10px] text-[#81746b]">Purchase total</p></div><ArrowRight aria-hidden="true" className="h-4 w-4 text-[#c6bab1] transition-transform group-hover:translate-x-0.5 group-hover:text-[#C85956]" /></div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : <div className="px-5 py-16 text-center"><PackageCheck aria-hidden="true" className="mx-auto h-7 w-7 text-[#c9bbb1]" /><p className="mt-3 text-sm font-bold text-[#3f3731]">No matching orders</p><p className="mt-1 text-[12px] text-[#8f8177]">Try another queue or clear the current filters.</p></div>}

        {totalPages > 1 && <div className="flex items-center justify-between border-t border-[#eee7e1] px-5 py-4"><p className="text-[11px] text-[#8f8177]">Page {page} of {totalPages}</p><div className="flex gap-2">{page > 1 && <Link href={hrefFor({ page: page - 1, order: undefined })} className="rounded-xl border border-[#e2d7cf] px-3 py-2 text-[11px] font-bold text-[#51473f] hover:bg-[#fcfaf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/20">Previous</Link>}{page < totalPages && <Link href={hrefFor({ page: page + 1, order: undefined })} className="rounded-xl border border-[#e2d7cf] px-3 py-2 text-[11px] font-bold text-[#51473f] hover:bg-[#fcfaf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/20">Next</Link>}</div></div>}
      </section>

      {selectedPurchase && <PurchasePreview purchase={selectedPurchase} selectedShipmentId={selectedShipmentId} closeHref={closeHref} />}
    </>
  );
}

function PurchasePreview({ purchase, selectedShipmentId, closeHref }: { purchase: AdminPurchaseGroup; selectedShipmentId?: string; closeHref: string }) {
  const selectedShipment = purchase.shipments.find((shipment) => shipment.id === selectedShipmentId) ?? purchase.shipments.find((shipment) => shipment.id === purchase.attentionShipmentId) ?? purchase.shipments[0];
  if (!selectedShipment) return null;
  const activity = purchase.shipments.flatMap((shipment) => [
    { id: `placed-${shipment.id}`, shipment: shipment.orderNumber, status: "placed", createdAt: shipment.createdAt, actor: "Storefront" },
    ...(shipment.statusHistory ?? []).map((entry) => ({ id: entry.id, shipment: shipment.orderNumber, status: entry.status, createdAt: entry.createdAt, actor: entry.actorName || entry.actorEmail || entry.actorRoleLabel || "Order lifecycle" })),
  ]).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 6);

  return (
    <OrderDrawerShell eyebrow="Purchase preview" title={purchase.number} closeHref={closeHref} actions={<Link href={`/admin/orders/${selectedShipment.id}`} className="inline-flex h-9 items-center rounded-full border border-[#e7ddd5] px-3 text-[10.5px] font-bold text-[#665950] transition-colors hover:bg-[#f7f1ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/20">Open selected shipment</Link>}>
      <div className="space-y-5 p-5">
        <section className="overflow-hidden rounded-2xl border border-[#eadfd7] bg-white"><div className="grid sm:grid-cols-2"><PreviewMetric label="Customer" value={purchase.customerName} detail={purchase.customerCity} icon={<MapPin aria-hidden="true" className="h-4 w-4" />} /><PreviewMetric label="Purchase total" value={purchaseTotal(purchase)} detail={`${purchase.shipments.length} shipments · ${purchase.items.length} variants`} icon={<PackageCheck aria-hidden="true" className="h-4 w-4" />} /><PreviewMetric label="Progress" value={purchase.progress.label} detail={`${purchase.progress.percent}% resolved`} icon={<CircleCheck aria-hidden="true" className="h-4 w-4" />} /><PreviewMetric label="Last update" value={formatDateTime(purchase.updatedAt)} detail={`Placed ${formatDateTime(purchase.createdAt)}`} icon={<Clock3 aria-hidden="true" className="h-4 w-4" />} /></div></section>

        {purchase.attentionReasons.length > 0 && <section className="rounded-2xl border border-red-100 bg-red-50/60 p-4"><div className="flex items-center gap-2"><AlertCircle aria-hidden="true" className="h-4 w-4 text-red-600" /><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-red-700">Needs action</p></div><div className="mt-3 space-y-2">{purchase.attentionReasons.slice(0, 4).map((reason) => <div key={`${reason.shipmentId}-${reason.code}`} className="rounded-xl bg-white px-3 py-2.5"><p className="text-[11px] font-bold text-[#493e37]">{reason.label}</p><p className="mt-1 text-[10px] leading-4 text-[#81746b]">{reason.detail}</p></div>)}</div></section>}

        <section>
          <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#C85956]">Shipments</p><h3 className="mt-1 text-sm font-extrabold text-[#302923]">Every fulfillment record in this purchase</h3></div><span className="text-[10px] font-semibold text-[#8f8177]">{purchase.shipments.length} total</span></div>
          <div className="mt-3 space-y-3">{purchase.shipments.map((shipment) => <ShipmentPreview key={shipment.id} shipment={shipment} reasons={purchase.attentionReasons.filter((reason) => reason.shipmentId === shipment.id)} selected={shipment.id === selectedShipment.id} />)}</div>
        </section>

        <section className="rounded-2xl border border-[#eadfd7] bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9b8d82]">Latest purchase activity</p><div className="mt-4 space-y-3">{activity.map((entry, index) => <div key={entry.id} className="flex gap-3"><span aria-hidden="true" className={`mt-1 h-2 w-2 flex-none rounded-full ${index === 0 ? "bg-[#C85956]" : "bg-[#d9cfc7]"}`} /><div className="min-w-0"><p className="text-[11.5px] font-bold text-[#4a4039]">{entry.status === "placed" ? "Order placed" : ORDER_STATUS_LABELS[entry.status as OrderStatus] ?? entry.status}</p><p className="mt-0.5 text-[10px] text-[#94867c]">#{entry.shipment} · {formatDateTime(entry.createdAt)}</p><p className="mt-0.5 truncate text-[9.5px] font-semibold text-[#a09287]">{entry.actor}</p></div></div>)}</div></section>
      </div>
    </OrderDrawerShell>
  );
}

function ShipmentPreview({ shipment, reasons, selected }: { shipment: OrderRecord; reasons: AdminOrderAttentionReason[]; selected: boolean }) {
  const payment = getOrderPaymentPresentation(shipment);
  return (
    <article className={`overflow-hidden rounded-2xl border bg-white ${selected ? "border-[#C85956]/35 ring-2 ring-[#C85956]/10" : "border-[#eadfd7]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eee7e1] bg-[#fcfaf8] px-4 py-3"><div className="flex flex-wrap items-center gap-2"><p className="text-[11.5px] font-extrabold text-[#403730]">#{shipment.orderNumber}</p><span className={`rounded-full px-2 py-1 text-[9.5px] font-bold ${orderStatusBadgeClass(shipment.status)}`}>{ORDER_STATUS_LABELS[shipment.status]}</span><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9.5px] font-bold ring-1 ring-inset ${paymentToneClass(payment.tone)}`}>{shipment.paymentMethod === "card" ? <CreditCard aria-hidden="true" className="h-3 w-3" /> : <Banknote aria-hidden="true" className="h-3 w-3" />}{payment.label}</span></div><Link href={`/admin/orders/${shipment.id}`} className="inline-flex items-center gap-1 text-[10px] font-bold text-[#A94442] hover:text-[#7f3432] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/20">Open workspace<ArrowRight aria-hidden="true" className="h-3 w-3" /></Link></div>
      <div className="space-y-3 p-4">
        <div className="grid gap-3 text-[10px] text-[#81746b] sm:grid-cols-2"><p className="inline-flex items-center gap-1.5">{shipment.fulfillmentType === "mahaly_pool" ? <Truck aria-hidden="true" className="h-3.5 w-3.5" /> : <PackageCheck aria-hidden="true" className="h-3.5 w-3.5" />}{shipment.fulfillmentType === "mahaly_pool" ? "Zakhnook fulfillment" : `${shipment.brandSlug || "Brand"} direct`}</p><p className="sm:text-right">{shipment.expectedDeliveryAt ? `Expected ${formatDateTime(shipment.expectedDeliveryAt)}` : "Delivery date not set"}</p></div>
        {reasons.length > 0 && <div className="flex flex-wrap gap-1.5">{reasons.map((reason) => <span key={reason.code} className={`rounded-full px-2 py-1 text-[9px] font-bold ring-1 ring-inset ${attentionClass(reason)}`}>{reason.label}</span>)}</div>}
        <div className="divide-y divide-[#f0e9e3]">{shipment.items.slice(0, 3).map((item) => <div key={item.id} className="flex items-center gap-3 py-2.5"><OrderItemThumbnail image={item.image} name={item.name} /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-[#403730]">{item.name}</p><p className="mt-1 truncate text-[10px] text-[#887a70]">{item.brand} · {item.color || "No color"} · {formatSize(item.size)} · Qty {item.quantity}</p></div></div>)}</div>
        <div className="flex items-end justify-between gap-3 border-t border-[#eee7e1] pt-3"><div><p className="text-[9px] font-bold uppercase tracking-[0.09em] text-[#9b8d82]">Tracking</p><p className="mt-1 text-[10px] text-[#81746b]">{shipment.trackingNumber ? `${shipment.carrierName || "Carrier"} · ${shipment.trackingNumber}` : "Not recorded"}</p></div><p className="text-[12px] font-extrabold text-[#242424]">{formatPrice(shipmentTotal(shipment), "EGP")}</p></div>
      </div>
    </article>
  );
}

function PreviewMetric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return <div className="flex gap-3 border-b border-[#eee7e1] p-4 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0"><span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-[#f7f2ed] text-[#C85956]">{icon}</span><div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[0.09em] text-[#9b8d82]">{label}</p><p className="mt-1 truncate text-[11px] font-bold text-[#403730]">{value}</p><p className="mt-0.5 truncate text-[9.5px] text-[#94867c]">{detail}</p></div></div>;
}
