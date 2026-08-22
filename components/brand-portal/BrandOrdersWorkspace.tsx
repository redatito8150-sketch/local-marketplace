"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Banknote, Check, ChevronLeft, ChevronRight, Clock3, CreditCard, Download, PackageCheck, Printer, RotateCcw, Search, Truck, X } from "lucide-react";
import BrandOrderStatusControl from "@/components/brand-portal/BrandOrderStatusControl";
import DateRangePicker from "@/components/ui/DateRangePicker";
import { ORDER_STATUS_LABELS, orderStatusBadgeClass } from "@/lib/admin/statuses";
import { formatDateOnly, formatDateTime, formatPrice, formatSize } from "@/lib/format";
import type { BrandOrder } from "@/lib/data/brandPortal";
import type { OrderStatus } from "@/types";
import { getOrderPaymentPresentation, paymentToneClass } from "@/lib/orders/paymentPresentation";
import { normalizeOrderStatus } from "@/lib/orders/lifecycle";
import AutoSubmitForm from "@/components/dashboard/AutoSubmitForm";

type Queue = "all" | "attention" | "active" | "fulfilled" | "cancelled";
type Params = { brand?: string; q?: string; queue?: string; from?: string; to?: string; sort?: string };

const QUEUES: Array<{ key: Queue; label: string; tone: string }> = [
  { key: "all", label: "All orders", tone: "bg-[#C85956]" },
  { key: "attention", label: "Needs action", tone: "bg-red-500" },
  { key: "active", label: "In progress", tone: "bg-amber-400" },
  { key: "fulfilled", label: "Delivered", tone: "bg-emerald-500" },
  { key: "cancelled", label: "Cancelled", tone: "bg-[#a9bbc5]" },
];

function productsSubtotal(order: BrandOrder) {
  return order.brandProductsSubtotalEgp;
}

function orderTotal(order: BrandOrder) {
  return productsSubtotal(order) - order.brandDiscountEgp + order.shippingFeeEgp;
}

function hasItemDiscount(item: BrandOrder["items"][number]) {
  return item.discountSource != null && item.discountSource !== "none" && item.originalUnitPrice != null;
}

function label(value?: string) {
  if (!value) return "Not available";
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function fulfillmentInstruction(order: BrandOrder): { title: string; detail: string } {
  if (order.fulfillmentType === "mahaly_pool") {
    return { title: "No action needed from your brand", detail: "Zakhnook is preparing and delivering this warehouse-fulfilled order." };
  }
  const status = normalizeOrderStatus(order.status as OrderStatus);
  if (status === "confirmed") return { title: "Accept and prepare this order", detail: "Confirm that you can fulfill the listed variants, then start packing them." };
  if (status === "preparing") return { title: "Finish packing for pickup", detail: "When the package is complete, mark it ready so Zakhnook can collect it." };
  if (status === "ready_for_pickup") return { title: "Waiting for Zakhnook pickup", detail: "Your work is complete for now. Zakhnook owns the next delivery step." };
  if (status === "shipped") return { title: "On the way to the customer", detail: "Zakhnook is delivering this shipment." };
  return { title: "No action needed", detail: "This shipment no longer needs a fulfillment action from your brand." };
}

function OrderImage({ item, size = "md" }: { item: BrandOrder["items"][number]; size?: "sm" | "md" | "lg" }) {
  const dimensions = size === "lg" ? "h-16 w-14" : size === "sm" ? "h-9 w-8" : "h-12 w-10";
  return (
    <div className={`relative flex-none overflow-hidden rounded-[10px] bg-[#f4eee8] ${dimensions}`}>
      {item.image ? <Image src={item.image} alt={`${item.name}${item.color ? ` in ${item.color}` : ""}`} fill sizes="64px" className="object-cover" /> : <div className="flex h-full items-center justify-center text-[#b9aaa0]"><PackageCheck className="h-4 w-4" /></div>}
    </div>
  );
}

export default function BrandOrdersWorkspace({ orders, initialSelectedOrder, counts, brandSlug, params, page, totalPages, totalOrders }: {
  orders: BrandOrder[];
  initialSelectedOrder: BrandOrder | null;
  counts: Record<Queue, number>;
  brandSlug: string;
  params: Params;
  page: number;
  totalPages: number;
  totalOrders: number;
}) {
  const [selected, setSelected] = useState<BrandOrder | null>(initialSelectedOrder);
  const activeQueue = (QUEUES.some((queue) => queue.key === params.queue) ? params.queue : "all") as Queue;
  const selectedPayment = selected ? getOrderPaymentPresentation(selected) : null;

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", close); document.body.style.overflow = ""; };
  }, [selected]);

  const baseParams = useMemo(() => {
    const next = new URLSearchParams();
    if (params.brand) next.set("brand", params.brand);
    if (params.q) next.set("q", params.q);
    if (params.from) next.set("from", params.from);
    if (params.to) next.set("to", params.to);
    if (params.sort) next.set("sort", params.sort);
    return next;
  }, [params]);

  const hrefFor = (changes: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(baseParams);
    if (activeQueue !== "all") next.set("queue", activeQueue);
    for (const [key, value] of Object.entries(changes)) value == null || value === "" ? next.delete(key) : next.set(key, String(value));
    return `/brand-portal/orders${next.size ? `?${next}` : ""}`;
  };
  const exportParams = new URLSearchParams(baseParams);
  if (activeQueue !== "all") exportParams.set("queue", activeQueue);
  const exportHref = `/api/brand-portal/orders/export${exportParams.size ? `?${exportParams}` : ""}`;

  return (
    <>
      <AutoSubmitForm action="/brand-portal/orders" className="relative mt-6">
          {params.brand && <input type="hidden" name="brand" value={params.brand} />}
          {activeQueue !== "all" && <input type="hidden" name="queue" value={activeQueue} />}
          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
            <label className="relative order-[1] min-w-0 lg:w-[320px] lg:flex-none">
              <span className="sr-only">Search orders</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9d8f84]" />
              <input name="q" defaultValue={params.q ?? ""} placeholder="Search order, customer or product" className="h-10 w-full rounded-xl border border-[#e5ddd5] bg-[#fcfaf8] pl-10 pr-4 text-[11.5px] font-semibold text-[#51473f] outline-none transition placeholder:font-normal placeholder:text-[#9b8d82] hover:border-[#d8ccc3] focus:border-[#C85956]/45 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#C85956]/8" />
            </label>
            <nav aria-label="Order queue" className="order-[2] flex h-10 min-w-0 overflow-x-auto rounded-xl border border-[#e7ddd5] bg-[#fcfaf8]">
              {QUEUES.map((queue) => {
                const active = activeQueue === queue.key;
                return <Link key={queue.key} href={hrefFor({ queue: queue.key === "all" ? undefined : queue.key, page: undefined })} aria-current={active ? "page" : undefined} className={`inline-flex h-full flex-none items-center gap-1.5 border-r border-[#eee7e1] px-3 text-[10.5px] font-bold transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/25 ${active ? "bg-[#f6e5e3] text-[#A94442]" : "text-[#6f635a] hover:bg-white hover:text-[#A94442]"}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${queue.tone}`} />{queue.label}<span className="tabular-nums text-[9.5px] opacity-70">{counts[queue.key]}</span></Link>;
              })}
            </nav>
            <DateRangePicker key={`${params.from ?? ""}-${params.to ?? ""}`} defaultFrom={params.from} defaultTo={params.to} compact label="Order date range" />
          </div>
      </AutoSubmitForm>

      <section className="relative mt-4 overflow-hidden rounded-[22px] border border-[#eadfd7] bg-white shadow-[0_10px_35px_rgba(72,50,36,0.045)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#eee7e1] bg-[#fcfaf8] px-5 py-3">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8d7f75]">Operational queue</p><p className="mt-0.5 text-[10.5px] text-[#9a8b80]">{totalOrders} matching {totalOrders === 1 ? "order" : "orders"}</p></div>
          <a href={exportHref} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e4d9d1] bg-white px-3 text-[10.5px] font-bold text-[#5d5148] transition hover:border-[#C85956]/30 hover:text-[#C85956]"><Download className="h-3.5 w-3.5" />Export CSV</a>
        </div>

        {orders.length ? <div className="divide-y divide-[#eee7e1]">{orders.map((order) => {
          const visibleItems = order.items.slice(0, 2);
          const payment = getOrderPaymentPresentation(order);
          return <article key={order.id} role="button" tabIndex={0} onClick={() => setSelected(order)} onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && setSelected(order)} className="group relative cursor-pointer px-4 py-4 outline-none transition hover:bg-[#fdfbf9] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/30 sm:px-5">
            <span className={`absolute bottom-4 left-0 top-4 w-[3px] rounded-r-full ${order.status === "cancelled" ? "bg-red-300" : order.status === "fulfilled" ? "bg-emerald-400" : order.fulfillmentType === "brand_direct" ? "bg-[#C85956]" : "bg-amber-300"}`} />
            <div className="grid gap-4 lg:grid-cols-[minmax(185px,.8fr)_minmax(300px,1.5fr)_minmax(150px,.65fr)] lg:items-center">
              <div><div className="flex flex-wrap items-center gap-2"><p className="text-[13px] font-extrabold text-[#242424]">#{order.orderNumber}</p><span className={`rounded-full px-2 py-1 text-[9.5px] font-bold ${orderStatusBadgeClass(order.status)}`}>{ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}</span><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9.5px] font-bold ring-1 ring-inset ${paymentToneClass(payment.tone)}`}>{order.paymentMethod === "card" ? <CreditCard className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}{payment.label}</span>{order.isOverdue && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[9.5px] font-bold text-red-700"><Clock3 className="h-3 w-3" />Overdue</span>}</div><p className="mt-1.5 truncate text-[11px] text-[#71645b]">{order.shippingName} · {order.shippingCity}</p><p className="mt-1 text-[10.5px] text-[#a09287]">{formatDateOnly(order.createdAt)}</p></div>
              <div className="space-y-2">{visibleItems.map((item) => <div key={item.id} className="flex items-center gap-3"><OrderImage item={item} /><div className="min-w-0"><p className="truncate text-[11.5px] font-bold text-[#4b413a]">{item.name}</p><p className="mt-1 truncate text-[10.5px] text-[#8e8177]">{item.color || "No color"} · {formatSize(item.size)} · Qty {item.quantity}</p></div></div>)}{order.items.length > 2 && <p className="pl-[52px] text-[10.5px] font-bold text-[#C85956]">+{order.items.length - 2} more variants</p>}</div>
              <div className="flex items-center justify-between gap-4 lg:justify-end"><div className="lg:text-right"><p className="text-[13px] font-extrabold text-[#242424]">{formatPrice(orderTotal(order), "EGP")}</p><p className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#81746b]">{order.fulfillmentType === "mahaly_pool" ? <><Truck className="h-3.5 w-3.5" />Zakhnook fulfillment</> : <><PackageCheck className="h-3.5 w-3.5" />Your fulfillment</>}</p></div><ChevronRight className="h-4 w-4 text-[#c6bab1] transition-transform group-hover:translate-x-0.5 group-hover:text-[#C85956]" /></div>
            </div>
          </article>;
        })}</div> : <div className="px-5 py-16 text-center"><PackageCheck className="mx-auto h-7 w-7 text-[#c9bbb1]" /><p className="mt-3 text-sm font-bold text-[#3f3731]">No matching orders</p><p className="mt-1 text-[12px] text-[#8f8177]">Try another queue or clear the current search.</p></div>}

        {totalPages > 1 && <div className="flex items-center justify-between border-t border-[#eee7e1] px-5 py-4"><p className="text-[11px] text-[#8f8177]">Page {page} of {totalPages}</p><div className="flex gap-2"><Link aria-disabled={page <= 1} href={page <= 1 ? hrefFor({ page: 1 }) : hrefFor({ page: page - 1 })} className={`inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-[11px] font-bold ${page <= 1 ? "pointer-events-none border-[#eee7e1] text-[#c5bab2]" : "border-[#e2d7cf] text-[#51473f] hover:bg-[#fcfaf8]"}`}><ChevronLeft className="h-3.5 w-3.5" />Previous</Link><Link aria-disabled={page >= totalPages} href={page >= totalPages ? hrefFor({ page }) : hrefFor({ page: page + 1 })} className={`inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-[11px] font-bold ${page >= totalPages ? "pointer-events-none border-[#eee7e1] text-[#c5bab2]" : "border-[#e2d7cf] text-[#51473f] hover:bg-[#fcfaf8]"}`}>Next<ChevronRight className="h-3.5 w-3.5" /></Link></div></div>}
      </section>

      {selected && <div className="order-print-overlay fixed inset-0 z-[90] flex justify-end bg-[#241c18]/25 backdrop-blur-[1px]" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
        <aside data-order-drawer role="dialog" aria-modal="true" aria-label={`Order ${selected.orderNumber}`} className="h-full w-full overflow-y-auto bg-[#fffdfb] shadow-[-24px_0_70px_rgba(36,28,24,.16)] sm:max-w-[520px]">
          <div data-order-print className="hidden">
            <div className="flex items-start justify-between border-b-2 border-[#242424] pb-5"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#C85956]">Zakhnook · Brand order</p><h1 className="mt-2 text-2xl font-extrabold text-[#242424]">#{selected.orderNumber}</h1><p className="mt-1 text-[11px] text-[#6f635b]">Placed {formatDateTime(selected.createdAt)}</p></div><div className="text-right"><p className="text-[11px] font-bold uppercase text-[#6f635b]">Order total</p><p className="mt-1 text-xl font-extrabold text-[#242424]">{formatPrice(orderTotal(selected), "EGP")}</p><p className="mt-1 text-[11px] font-bold text-[#C85956]">{ORDER_STATUS_LABELS[selected.status as OrderStatus] ?? selected.status}</p></div></div>
            <div className="mt-5 grid grid-cols-3 gap-3"><div className="rounded-xl border border-[#ddd3cb] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8d8076]">Customer</p><p className="mt-2 text-[11px] font-bold text-[#242424]">{selected.shippingName}</p><p className="mt-1 text-[10px] text-[#6f635b]">{selected.shippingCity}, {selected.shippingGovernorate}</p></div><div className="rounded-xl border border-[#ddd3cb] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8d8076]">Payment</p><p className="mt-2 text-[11px] font-bold text-[#242424]">{selectedPayment?.label}</p><p className="mt-1 text-[10px] text-[#6f635b]">{selectedPayment?.detail}</p></div><div className="rounded-xl border border-[#ddd3cb] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8d8076]">Fulfillment</p><p className="mt-2 text-[11px] font-bold text-[#242424]">{selected.fulfillmentType === "mahaly_pool" ? "Zakhnook" : "Brand direct"}</p><p className="mt-1 text-[10px] text-[#6f635b]">{selected.fulfillmentType === "mahaly_pool" ? "Marketplace managed" : "Brand handoff"}</p></div></div>
            <section className="mt-6"><h2 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#6f635b]">Products</h2><table className="mt-2 w-full border-collapse text-left"><thead><tr className="border-y border-[#d9cfc7] text-[9px] uppercase tracking-[0.08em] text-[#8d8076]"><th className="py-2 font-bold">Product</th><th className="py-2 font-bold">Color / Size</th><th className="py-2 text-center font-bold">Qty</th><th className="py-2 text-right font-bold">Total</th></tr></thead><tbody>{selected.items.map((item) => <tr key={item.id} className="border-b border-[#ebe4de] text-[10.5px] text-[#3f3731]"><td className="py-2.5 font-bold">{item.name}</td><td className="py-2.5">{item.color || "No color"} / {formatSize(item.size)}</td><td className="py-2.5 text-center">{item.quantity}</td><td className="py-2.5 text-right font-bold">{hasItemDiscount(item) && <span className="mr-1.5 font-normal text-[#8d8076] line-through">{formatPrice(item.originalUnitPrice! * item.quantity, item.currency)}</span>}{formatPrice(item.price * item.quantity, item.currency)}</td></tr>)}</tbody></table><div className="ml-auto mt-3 w-56 space-y-1.5 text-[10px]"><div className="flex justify-between"><span className="text-[#756960]">Products subtotal</span><span className="font-bold">{formatPrice(productsSubtotal(selected), "EGP")}</span></div>{selected.brandDiscountEgp > 0 && <div className="flex justify-between text-[#C85956]"><span>Coupon{selected.couponCode ? ` (${selected.couponCode})` : ""}</span><span className="font-bold">−{formatPrice(selected.brandDiscountEgp, "EGP")}</span></div>}<div className="flex justify-between"><span className="text-[#756960]">Delivery</span><span className="font-bold">{selected.shippingFeeEgp > 0 ? formatPrice(selected.shippingFeeEgp, "EGP") : "Free"}</span></div><div className="flex justify-between border-t border-[#d9cfc7] pt-1.5 text-[11px]"><span className="font-extrabold">Order total</span><span className="font-extrabold">{formatPrice(orderTotal(selected), "EGP")}</span></div></div></section>
            <section className="mt-6"><h2 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#6f635b]">Status history</h2><div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2">{[{ status: "placed", note: "Order placed", createdAt: selected.createdAt }, ...selected.history].map((entry, index) => <div key={`${entry.status}-${entry.createdAt}-${index}`} className="border-l-2 border-[#C85956] pl-2.5"><p className="text-[10px] font-bold text-[#242424]">{entry.status === "placed" ? "Order placed" : ORDER_STATUS_LABELS[entry.status as OrderStatus] ?? label(entry.status)}</p><p className="mt-0.5 text-[9px] text-[#756960]">{formatDateTime(entry.createdAt)}</p>{entry.note && <p className="mt-0.5 text-[9px] leading-4 text-[#756960]">{entry.note}</p>}</div>)}</div></section>
            <p className="mt-8 border-t border-[#d9cfc7] pt-3 text-[9px] text-[#8d8076]">Generated from the Zakhnook brand portal · Tracking and customer returns appear when their operational integrations are connected.</p>
          </div>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#eee5de] bg-[#fffdfb]/95 px-5 py-4 backdrop-blur"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#C85956]">Order details</p><h2 className="mt-1 text-lg font-extrabold tracking-[-0.03em] text-[#242424]">#{selected.orderNumber}</h2></div><div className="flex gap-2"><button data-print-hide type="button" onClick={() => window.print()} className="flex h-9 items-center gap-1.5 rounded-full border border-[#e7ddd5] px-3 text-[10.5px] font-bold text-[#665950] transition hover:bg-[#f7f1ec]"><Printer className="h-3.5 w-3.5" />Print</button><button data-print-hide type="button" autoFocus onClick={() => setSelected(null)} aria-label="Close order details" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e7ddd5] text-[#665950] transition hover:bg-[#f7f1ec]"><X className="h-4 w-4" /></button></div></div>
          <div className="space-y-5 p-5">
            <section className="overflow-hidden rounded-2xl border border-[#eadfd7] bg-white">
              <div className="flex items-start justify-between gap-4 border-b border-[#eee7e1] px-4 py-4">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9b8d82]">Order summary</p><p className="mt-2 text-[11px] text-[#8f8177]">Placed {formatDateTime(selected.createdAt)}</p></div>
                <div className="flex flex-wrap justify-end gap-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${orderStatusBadgeClass(selected.status)}`}>{ORDER_STATUS_LABELS[selected.status as OrderStatus] ?? selected.status}</span>{selected.isOverdue && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700"><Clock3 className="h-3 w-3" />Action overdue</span>}</div>
              </div>
              <div className="divide-y divide-[#f0e9e3] px-4">{selected.items.map((item) => <div key={item.id} className="flex gap-3 py-3.5"><OrderImage item={item} size="lg" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[12px] font-bold text-[#403730]">{item.name}</p><p className="mt-1 text-[10.5px] text-[#887a70]">{item.color || "No color"} · {formatSize(item.size)}</p></div><div className="flex-none text-right">{hasItemDiscount(item) && <p className="text-[9.5px] text-[#a09287] line-through">{formatPrice(item.originalUnitPrice! * item.quantity, item.currency)}</p>}<p className={`text-[11px] font-extrabold ${hasItemDiscount(item) ? "text-[#C85956]" : "text-[#403730]"}`}>{formatPrice(item.price * item.quantity, item.currency)}</p></div></div><p className="mt-2 text-[10.5px] text-[#887a70]">Quantity {item.quantity}{item.quantity > 1 && <span> · {formatPrice(item.price, item.currency)} each</span>}</p></div></div>)}</div>
              <div className="border-t border-[#eee7e1] bg-[#fcfaf8] px-4 py-4"><div className="space-y-2 text-[11px]"><div className="flex items-center justify-between text-[#74675e]"><span>Products subtotal</span><span className="font-semibold text-[#4a4039]">{formatPrice(productsSubtotal(selected), "EGP")}</span></div>{selected.brandDiscountEgp > 0 && <div className="flex items-center justify-between text-[#C85956]"><span>Coupon{selected.couponCode ? ` (${selected.couponCode})` : ""}</span><span className="font-semibold">−{formatPrice(selected.brandDiscountEgp, "EGP")}</span></div>}<div className="flex items-center justify-between text-[#74675e]"><span>Delivery</span><span className="font-semibold text-[#4a4039]">{selected.shippingFeeEgp > 0 ? formatPrice(selected.shippingFeeEgp, "EGP") : "Free"}</span></div></div><div className="mt-3 flex items-end justify-between border-t border-[#e8dfd8] pt-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9b8d82]">Order total</p>{selectedPayment && <p className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9.5px] font-bold ring-1 ring-inset ${paymentToneClass(selectedPayment.tone)}`}>{selected.paymentMethod === "card" ? <CreditCard className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}{selectedPayment.label}</p>}</div><p className="text-lg font-extrabold tracking-[-0.03em] text-[#242424]">{formatPrice(orderTotal(selected), "EGP")}</p></div></div>
            </section>
            <section className={`rounded-2xl border p-4 ${selected.fulfillmentType === "mahaly_pool" ? "border-[#e5ddd6] bg-[#f6f2ee]" : "border-[#C85956]/20 bg-[#fff1ef]"}`}>
              <div className="flex gap-3">{selected.fulfillmentType === "mahaly_pool" ? <Truck className="mt-0.5 h-4 w-4 flex-none text-[#6c6058]" /> : <PackageCheck className="mt-0.5 h-4 w-4 flex-none text-[#C85956]" />}<div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#9b8d82]">Fulfillment & delivery</p><p className="mt-2 text-[12px] font-bold text-[#403730]">{fulfillmentInstruction(selected).title}</p><p className="mt-1 text-[10.5px] leading-5 text-[#81746b]">{fulfillmentInstruction(selected).detail}</p>{selected.fulfillmentType === "brand_direct" && <div data-print-hide className="mt-3"><BrandOrderStatusControl orderId={selected.id} status={selected.status} brandSlug={brandSlug} /></div>}</div></div>
              <div className="mt-4 grid gap-3 border-t border-[#dfd6cf] pt-4 sm:grid-cols-2"><div><p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#9b8d82]">Deliver to</p><p className="mt-1.5 text-[11.5px] font-bold text-[#403730]">{selected.shippingName}</p><p className="mt-1 text-[10px] text-[#81746b]">{selected.shippingCity}, {selected.shippingGovernorate}</p></div><div className="border-t border-[#dfd6cf] pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0"><p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#9b8d82]">Tracking</p><p className="mt-1.5 text-[11px] font-bold text-[#403730]">{selected.fulfillmentType === "mahaly_pool" ? "Managed by Zakhnook" : "Not assigned yet"}</p><p className="mt-1 text-[10px] leading-4 text-[#81746b]">Carrier details appear after dispatch.</p></div></div>
            </section>
            <section className="rounded-2xl border border-[#eadfd7] bg-white p-4">
              <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#9b8d82]">Order activity</p><Clock3 className="h-4 w-4 text-[#b3a59b]" /></div>
              <div className="mt-4 space-y-0">
                {[{ status: "placed", note: "Order placed", createdAt: selected.createdAt }, ...selected.history].map((entry, index, entries) => <div key={`${entry.status}-${entry.createdAt}-${index}`} className="grid grid-cols-[20px_1fr] gap-3"><div className="flex flex-col items-center"><span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${index === entries.length - 1 ? "bg-[#C85956] text-white" : "bg-[#f1ebe6] text-[#8a7d73]"}`}>{index === entries.length - 1 ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span>{index < entries.length - 1 && <span className="min-h-8 w-px flex-1 bg-[#eadfd7]" />}</div><div className="pb-4"><p className="text-[11.5px] font-bold text-[#4a4039]">{entry.status === "placed" ? "Order placed" : ORDER_STATUS_LABELS[entry.status as OrderStatus] ?? label(entry.status)}</p><p className="mt-0.5 text-[10px] text-[#94867c]">{formatDateTime(entry.createdAt)}</p>{entry.note && <p className="mt-1 text-[10.5px] leading-4 text-[#81746b]">{entry.note}</p>}</div></div>)}
              </div>
              <div className="flex gap-3 border-t border-[#eee7e1] pt-3"><RotateCcw className="mt-0.5 h-4 w-4 flex-none text-[#9b8d82]" /><div><div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-bold text-[#403730]">Customer returns</p><span className="rounded-full bg-[#f6f2ee] px-2 py-0.5 text-[9px] font-bold text-[#9b8d82]">Not connected</span></div><p className="mt-1 text-[10px] leading-4 text-[#81746b]">Return requests and refund status will appear here once the workflow is connected.</p></div></div>
            </section>
          </div>
        </aside>
      </div>}
      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          html, body { margin: 0 !important; background: white !important; }
          body * { visibility: hidden !important; }
          .order-print-overlay { position: fixed !important; inset: 0 !important; display: block !important; background: white !important; backdrop-filter: none !important; }
          [data-order-drawer] { position: fixed !important; inset: 0 !important; display: block !important; width: 100% !important; max-width: none !important; height: 100% !important; overflow: hidden !important; background: white !important; box-shadow: none !important; }
          [data-order-drawer] > :not([data-order-print]) { display: none !important; }
          [data-order-print], [data-order-print] * { visibility: visible !important; }
          [data-order-print] { display: block !important; padding: 8mm !important; color: #242424 !important; }
        }
      `}</style>
    </>
  );
}
