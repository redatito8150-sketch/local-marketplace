import Link from "next/link";
import { ArrowRight, Banknote, CreditCard, Download, PackageCheck, Search, Truck } from "lucide-react";
import AutoSubmitForm from "@/components/dashboard/AutoSubmitForm";
import { DashboardFilterField, DashboardMoreFilters, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import DateRangePicker from "@/components/ui/DateRangePicker";
import OrderDrawerShell from "@/components/orders/OrderDrawerShell";
import OrderItemThumbnail from "@/components/orders/OrderItemThumbnail";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, orderStatusBadgeClass } from "@/lib/admin/statuses";
import { formatDateOnly, formatDateTime, formatPrice, formatSize } from "@/lib/format";
import { getOrderPaymentPresentation, paymentToneClass } from "@/lib/orders/paymentPresentation";
import type { AdminOrderQueue, AdminPurchaseGroup } from "@/lib/orders/adminOrderFilters";
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

function orderTotal(order: OrderRecord) {
  return order.subtotalEgp - order.discountAmountEgp + order.shippingFeeEgp;
}

export default function AdminOrdersWorkspace({ groups, selectedOrder, counts, brands, params, page, totalPages, totalPurchases }: {
  groups: AdminPurchaseGroup[];
  selectedOrder: OrderRecord | null;
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

  return (
    <>
      <AutoSubmitForm action="/admin/orders" className="mt-6">
        {activeQueue !== "all" && <input type="hidden" name="queue" value={activeQueue} />}
        <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
          <label className="relative order-[1] min-w-0 xl:w-[320px] xl:flex-none">
            <span className="sr-only">Search orders</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9d8f84]" />
            <input name="q" defaultValue={params.q ?? ""} placeholder="Purchase, order, customer or product" className="h-10 w-full rounded-xl border border-[#e5ddd5] bg-white pl-10 pr-4 text-[11.5px] font-semibold text-[#51473f] outline-none transition placeholder:font-normal placeholder:text-[#9b8d82] hover:border-[#d8ccc3] focus:border-[#ded6cf] focus:ring-2 focus:ring-[#e7e4de]/70" />
          </label>
          <nav aria-label="Order queue" className="order-[2] flex h-10 min-w-0 overflow-x-auto rounded-xl border border-[#e7ddd5] bg-white">
            {QUEUES.map((queue) => {
              const active = activeQueue === queue.key;
              return (
                <Link key={queue.key} href={hrefFor({ queue: queue.key, page: undefined, order: undefined })} aria-current={active ? "page" : undefined} className={`inline-flex h-full flex-none items-center gap-1.5 border-r border-[#eee7e1] px-3 text-[10.5px] font-bold transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/20 ${active ? "bg-[#f6e5e3] text-[#A94442]" : "text-[#6f635a] hover:bg-[#fcfaf8] hover:text-[#A94442]"}`}>
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${queue.tone}`} />{queue.label}<span className="tabular-nums text-[9.5px] opacity-70">{counts[queue.key]}</span>
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
          <Link href="/api/admin/orders/export" prefetch={false} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e4d9d1] bg-white px-3 text-[10.5px] font-bold text-[#5d5148] transition hover:border-[#C85956]/30 hover:text-[#C85956]"><Download className="h-3.5 w-3.5" />Export CSV</Link>
        </div>

        {groups.length ? (
          <div className="divide-y divide-[#eee7e1]">
            {groups.map((group) => {
              const visibleItems = group.items.slice(0, 2);
              const statuses = [...new Set(group.shipments.map((shipment) => shipment.status))];
              const firstShipment = group.shipments[0];
              const payment = getOrderPaymentPresentation(firstShipment);
              return (
                <Link key={group.id} href={hrefFor({ order: firstShipment.id })} scroll={false} aria-label={`Preview purchase ${group.number}`} className="group relative block px-4 py-4 outline-none transition-colors hover:bg-[#fdfbf9] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/25 sm:px-5">
                  <span className={`absolute bottom-4 left-0 top-4 w-[3px] rounded-r-full ${statuses.every((status) => status === "fulfilled") ? "bg-emerald-400" : statuses.every((status) => status === "cancelled") ? "bg-red-300" : "bg-[#C85956]"}`} />
                  <div className="grid gap-4 xl:grid-cols-[minmax(175px,.7fr)_minmax(300px,1.35fr)_minmax(190px,.75fr)_minmax(135px,.55fr)] xl:items-center">
                    <div><p className="text-[13px] font-extrabold text-[#242424]">{group.number}</p><p className="mt-1.5 truncate text-[11px] text-[#71645b]">{group.customerName}</p><p className="mt-1 text-[10.5px] text-[#a09287]">{formatDateOnly(group.createdAt)}</p></div>
                    <div className="space-y-2">{visibleItems.map((item) => <div key={item.id} className="flex items-center gap-3"><OrderItemThumbnail image={item.image} name={item.name} /><div className="min-w-0"><p className="truncate text-[11.5px] font-bold text-[#4b413a]">{item.name}</p><p className="mt-1 truncate text-[10.5px] text-[#8e8177]">{item.brand} · {item.color || "No color"} · {formatSize(item.size)} · Qty {item.quantity}</p></div></div>)}{group.items.length > 2 && <p className="pl-[52px] text-[10.5px] font-bold text-[#C85956]">+{group.items.length - 2} more variants</p>}</div>
                    <div><div className="flex flex-wrap gap-1.5">{statuses.slice(0, 2).map((status) => <span key={status} className={`rounded-full px-2 py-1 text-[9.5px] font-bold ${orderStatusBadgeClass(status)}`}>{ORDER_STATUS_LABELS[status as OrderStatus] ?? status}</span>)}{statuses.length > 2 && <span className="rounded-full bg-[#f3eee9] px-2 py-1 text-[9.5px] font-bold text-[#766960]">+{statuses.length - 2}</span>}<span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9.5px] font-bold ring-1 ring-inset ${paymentToneClass(payment.tone)}`}>{firstShipment.paymentMethod === "card" ? <CreditCard className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}{payment.label}</span></div><p className="mt-2 text-[10px] font-semibold text-[#81746b]">{group.shipments.length} {group.shipments.length === 1 ? "shipment" : "shipments"} · {group.items.length} variants</p></div>
                    <div className="flex items-center justify-between gap-4 xl:justify-end"><div className="xl:text-right"><p className="text-[13px] font-extrabold text-[#242424]">{purchaseTotal(group)}</p><p className="mt-1 text-[10px] text-[#81746b]">Purchase total</p></div><ArrowRight className="h-4 w-4 text-[#c6bab1] transition-transform group-hover:translate-x-0.5 group-hover:text-[#C85956]" /></div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-16 text-center"><PackageCheck className="mx-auto h-7 w-7 text-[#c9bbb1]" /><p className="mt-3 text-sm font-bold text-[#3f3731]">No matching orders</p><p className="mt-1 text-[12px] text-[#8f8177]">Try another queue or clear the current filters.</p></div>
        )}

        {totalPages > 1 && <div className="flex items-center justify-between border-t border-[#eee7e1] px-5 py-4"><p className="text-[11px] text-[#8f8177]">Page {page} of {totalPages}</p><div className="flex gap-2">{page > 1 && <Link href={hrefFor({ page: page - 1, order: undefined })} className="rounded-xl border border-[#e2d7cf] px-3 py-2 text-[11px] font-bold text-[#51473f] hover:bg-[#fcfaf8]">Previous</Link>}{page < totalPages && <Link href={hrefFor({ page: page + 1, order: undefined })} className="rounded-xl border border-[#e2d7cf] px-3 py-2 text-[11px] font-bold text-[#51473f] hover:bg-[#fcfaf8]">Next</Link>}</div></div>}
      </section>

      {selectedOrder && (
        <OrderDrawerShell eyebrow="Order preview" title={`#${selectedOrder.orderNumber}`} closeHref={closeHref} actions={<Link href={`/admin/orders/${selectedOrder.id}`} className="inline-flex h-9 items-center rounded-full border border-[#e7ddd5] px-3 text-[10.5px] font-bold text-[#665950] transition hover:bg-[#f7f1ec]">Open workspace</Link>}>
          <div className="space-y-5 p-5">
            <section className="overflow-hidden rounded-2xl border border-[#eadfd7] bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#fcfaf8] px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9b8d82]">Purchase {selectedOrder.masterOrderNumber}</p><p className="mt-1 text-[11px] text-[#81746b]">Placed {formatDateTime(selectedOrder.createdAt)}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${orderStatusBadgeClass(selectedOrder.status)}`}>{ORDER_STATUS_LABELS[selectedOrder.status]}</span></div>
              <div className="divide-y divide-[#f0e9e3] px-4">{selectedOrder.items.map((item) => <div key={item.id} className="flex gap-3 py-3.5"><OrderItemThumbnail image={item.image} name={item.name} size="lg" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[12px] font-bold text-[#403730]">{item.name}</p><p className="mt-1 text-[10.5px] text-[#887a70]">{item.brand} · {item.color || "No color"} · {formatSize(item.size)}</p></div><p className="flex-none text-[11px] font-extrabold text-[#403730]">{formatPrice(item.price * item.quantity, item.currency)}</p></div><p className="mt-2 text-[10.5px] text-[#887a70]">Quantity {item.quantity}</p></div></div>)}</div>
              <div className="flex items-end justify-between border-t border-[#eee7e1] bg-[#fcfaf8] px-4 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9b8d82]">Shipment total</p><p className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#81746b]">{selectedOrder.fulfillmentType === "mahaly_pool" ? <><Truck className="h-3.5 w-3.5" />Zakhnook fulfillment</> : <><PackageCheck className="h-3.5 w-3.5" />Brand direct</>}</p></div><p className="text-lg font-extrabold tracking-[-0.03em] text-[#242424]">{formatPrice(orderTotal(selectedOrder), "EGP")}</p></div>
            </section>
            <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-[#eadfd7] bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9b8d82]">Customer</p><p className="mt-2 text-[12px] font-bold text-[#403730]">{selectedOrder.shippingName}</p><p className="mt-1 text-[10.5px] text-[#81746b]">{selectedOrder.shippingCity}, {selectedOrder.shippingGovernorate}</p></div><div className="rounded-2xl border border-[#eadfd7] bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9b8d82]">Payment</p><p className="mt-2 text-[12px] font-bold text-[#403730]">{getOrderPaymentPresentation(selectedOrder).label}</p><p className="mt-1 text-[10.5px] text-[#81746b]">{getOrderPaymentPresentation(selectedOrder).detail}</p></div></section>
            <section className="rounded-2xl border border-[#eadfd7] bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9b8d82]">Latest activity</p><div className="mt-4 space-y-3">{[{ status: "placed", createdAt: selectedOrder.createdAt }, ...(selectedOrder.statusHistory ?? [])].slice(-4).reverse().map((entry, index) => <div key={`${entry.status}-${entry.createdAt}-${index}`} className="flex gap-3"><span className={`mt-1 h-2 w-2 flex-none rounded-full ${index === 0 ? "bg-[#C85956]" : "bg-[#d9cfc7]"}`} /><div><p className="text-[11.5px] font-bold text-[#4a4039]">{entry.status === "placed" ? "Order placed" : ORDER_STATUS_LABELS[entry.status as OrderStatus]}</p><p className="mt-0.5 text-[10px] text-[#94867c]">{formatDateTime(entry.createdAt)}</p></div></div>)}</div></section>
          </div>
        </OrderDrawerShell>
      )}
    </>
  );
}
