"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, PackageOpen, XCircle } from "lucide-react";
import type { ProductRecord, StockStatus } from "@/types";
import { calculateStockStatus, effectiveLowStockThreshold } from "@/lib/inventory/stockStatus";
import AdminProductDeletionActions from "@/components/admin/AdminProductDeletionActions";
import ProductActionDialog from "@/components/products/ProductActionDialog";
import { ProductStatusBadges } from "@/components/products/ProductStatusBadges";
import ProductPriceDisplay from "@/components/products/ProductPriceDisplay";
import SortableTableHeader from "@/components/dashboard/SortableTableHeader";

type BulkResult = { succeeded: string[]; failed: { productId: string; message: string }[] };

function existingNameById(products: ProductRecord[], id: string): string {
  return products.find((product) => product.id === id)?.name ?? id;
}

function getInventorySummary(product: ProductRecord): { status: StockStatus; units: number; variants: number; issueCount: number } {
  const variants = (product.variants ?? []).filter((variant) => !variant.isArchived);
  const activeVariants = variants.filter((variant) => variant.sellingStatus === "active");
  const statuses = activeVariants.map((variant) => calculateStockStatus(
    variant.quantity,
    effectiveLowStockThreshold(variant.lowStockThresholdOverride, product.defaultLowStockThreshold ?? 0)
  ));
  const status: StockStatus = !statuses.length || statuses.every((value) => value === "out_of_stock")
    ? "out_of_stock"
    : statuses.some((value) => value === "low_stock" || value === "out_of_stock")
      ? "low_stock"
      : "in_stock";
  return {
    status,
    units: activeVariants.reduce((sum, variant) => sum + Math.max(0, variant.quantity), 0),
    variants: variants.length,
    issueCount: statuses.filter((value) => value !== "in_stock").length,
  };
}

function InventorySummary({ product }: { product: ProductRecord }) {
  const inventory = getInventorySummary(product);
  const status = inventory.status === "out_of_stock"
    ? { label: "Out of stock", dot: "bg-red-500", text: "text-red-700" }
    : inventory.status === "low_stock"
      ? { label: "Low stock", dot: "bg-amber-500", text: "text-amber-700" }
      : { label: "In stock", dot: "bg-emerald-500", text: "text-emerald-700" };
  return (
    <div>
      <p className={`inline-flex items-center gap-1.5 text-[12.5px] font-bold ${status.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />{status.label}
      </p>
      <p className="mt-1 text-[11px] tabular-nums text-[#94867c]">
        {inventory.units} units · {inventory.variants} {inventory.variants === 1 ? "variant" : "variants"}
        {inventory.issueCount > 0 ? ` · ${inventory.issueCount} need attention` : ""}
      </p>
    </div>
  );
}

function ProductImage({ product, className, priority = false }: { product: ProductRecord; className: string; priority?: boolean }) {
  return (
    <span className={`relative block flex-none overflow-hidden rounded-xl bg-[#f1eae2] ${className}`}>
      {product.image ? <Image src={product.image} alt={product.name} fill sizes="96px" priority={priority} className="object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[#a29489]"><PackageOpen className="h-5 w-5" aria-hidden="true" /></span>}
    </span>
  );
}

export default function BulkProductActions({ products, totalProducts, clearHref, sort, sortHrefs }: { products: ProductRecord[]; totalProducts: number; clearHref: string; sort?: string; sortHrefs: Record<"product" | "category" | "price" | "inventory" | "status", string> }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [error, setError] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);

  const selectedProducts = products.filter((product) => selected.has(product.id));

  const toggleOne = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((current) => current.size === products.length ? new Set() : new Set(products.map((product) => product.id)));
  };

  const runBulkAction = async (action: "publish" | "archive") => {
    setBusy(true);
    setBulkResult(null);
    setError("");
    try {
      const response = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "The selected products could not be updated. Check their status and try again.");
        return;
      }
      setBulkResult({ succeeded: data.succeeded ?? [], failed: data.failed ?? [] });
      setSelected(new Set());
      setConfirmArchive(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-3 overflow-hidden rounded-[18px] border border-[#e3dcd3] bg-white shadow-[0_10px_30px_rgba(67,45,29,0.035)]" aria-label="Products">
      {selected.size > 0 ? (
        <div className="flex flex-col gap-3 border-b border-[#eadfd7] bg-[#fff8f6] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-mahalyred px-2 text-[11px] font-bold tabular-nums text-white">{selected.size}</span>
            <div><p className="text-[12.5px] font-bold text-[#302924]">Products selected</p><button type="button" onClick={() => setSelected(new Set())} className="mt-0.5 text-[10.5px] font-semibold text-[#81746a] underline-offset-4 hover:text-mahalyred hover:underline">Clear selection</button></div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} onClick={() => runBulkAction("publish")} className="h-10 rounded-xl border border-[#ddd6cd] bg-white px-4 text-[12px] font-semibold text-[#51473f] transition-colors duration-150 hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 disabled:opacity-50">Publish</button>
            <button type="button" disabled={busy} onClick={() => setConfirmArchive(true)} className="h-10 rounded-xl bg-mahalyred px-4 text-[12px] font-semibold text-white transition-colors duration-150 hover:bg-mahalyred-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/30 disabled:opacity-50">Archive</button>
          </div>
        </div>
      ) : null}

      <div aria-live="polite" aria-atomic="true">
        {error ? <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-3 text-[12px] font-medium text-red-700">{error}</p> : null}
        {bulkResult ? (
          <div className="border-b border-[#eee7de] bg-[#fcfaf8] px-4 py-3 text-[12px]">
            {bulkResult.succeeded.length > 0 ? <p className="inline-flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{bulkResult.succeeded.length} {bulkResult.succeeded.length === 1 ? "product" : "products"} updated</p> : null}
            {bulkResult.failed.length > 0 ? <div className="mt-2 text-red-700"><p className="inline-flex items-center gap-2 font-semibold"><XCircle className="h-4 w-4" aria-hidden="true" />{bulkResult.failed.length} could not be processed</p><ul className="mt-1 list-disc pl-6">{bulkResult.failed.map((failure) => <li key={failure.productId}>{existingNameById(products, failure.productId)}: {failure.message}</li>)}</ul></div> : null}
          </div>
        ) : null}
      </div>

      {products.length ? (
        <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1080px] text-left text-[13px]">
              <thead className="border-b border-[#e8e0d7] bg-[#fbf8f4] text-[10.5px] uppercase tracking-[0.08em] text-[#897b70]">
                <tr>
                  <th className="w-14 px-4 py-3"><label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl hover:bg-[#f1eae2]"><input type="checkbox" checked={products.length > 0 && selected.size === products.length} onChange={toggleAll} aria-label="Select all products on this page" className="h-4 w-4 accent-mahalyred" /></label></th>
                  <SortableTableHeader className="px-4" label="Product" href={sortHrefs.product} active={sort?.startsWith("product-")} direction={sort?.endsWith("desc") ? "desc" : "asc"} />
                  <SortableTableHeader className="px-4" label="Category" href={sortHrefs.category} active={sort?.startsWith("category-")} direction={sort?.endsWith("desc") ? "desc" : "asc"} />
                  <SortableTableHeader className="px-4" label="Price" href={sortHrefs.price} active={sort?.startsWith("price-")} direction={sort?.endsWith("desc") ? "desc" : "asc"} />
                  <SortableTableHeader className="px-4" label="Inventory" href={sortHrefs.inventory} active={sort?.startsWith("inventory-")} direction={sort?.endsWith("desc") ? "desc" : "asc"} />
                  <SortableTableHeader className="px-4" label="Status & visibility" href={sortHrefs.status} active={sort?.startsWith("status-")} direction={sort?.endsWith("desc") ? "desc" : "asc"} />
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee7de]">
                {products.map((product, index) => (
                  <tr key={product.id} className={`transition-colors duration-150 hover:bg-[#fbf8f4] ${selected.has(product.id) ? "bg-[#fff8f6]" : ""}`}>
                    <td className="px-4 py-3"><label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl hover:bg-[#f1eae2]"><input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleOne(product.id)} aria-label={`Select ${product.name}`} className="h-4 w-4 accent-mahalyred" /></label></td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/products/${product.id}/edit`} className="group flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">
                        <ProductImage product={product} className="h-16 w-14" priority={index === 0} />
                        <div className="min-w-0"><p className="max-w-[260px] truncate font-bold text-[#242424] transition-colors duration-150 group-hover:text-mahalyred">{product.name}</p><p className="mt-1 truncate text-[10.5px] text-[#8a7d73]">{product.sku}</p><p className="mt-1 truncate text-[10.5px] font-bold text-mahalyred/80" translate="no">{product.brandName}</p></div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#75685f]"><p>{product.mainCategory || "Not assigned"}</p>{product.productTypeName ? <p className="mt-1 text-[11px] text-[#9b8e84]">{product.productTypeName}</p> : null}</td>
                    <td className="px-4 py-3"><ProductPriceDisplay product={product} /></td>
                    <td className="px-4 py-3"><InventorySummary product={product} /></td>
                    <td className="px-4 py-3"><ProductStatusBadges product={product} showReviewNotes /></td>
                    <td className="px-4 py-3"><div className="flex items-center justify-end"><AdminProductDeletionActions product={product} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-[#eee7de] lg:hidden">
            {products.map((product, index) => (
              <article key={product.id} className={selected.has(product.id) ? "bg-[#fff8f6] p-4 sm:p-5" : "p-4 sm:p-5"}>
                <div className="flex items-start gap-3">
                  <label className="flex h-10 w-10 flex-none cursor-pointer items-center justify-center rounded-xl bg-[#f7f2ec]"><input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleOne(product.id)} aria-label={`Select ${product.name}`} className="h-4 w-4 accent-mahalyred" /></label>
                  <Link href={`/admin/products/${product.id}/edit`} className="flex-none rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"><ProductImage product={product} className="h-24 w-20" priority={index === 0} /></Link>
                  <div className="min-w-0 flex-1"><Link href={`/admin/products/${product.id}/edit`} className="block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"><h2 className="truncate text-[15px] font-bold text-[#242424] hover:text-mahalyred">{product.name}</h2></Link><p className="mt-1 truncate text-[10.5px] text-[#8a7d73]">{product.sku}</p><p className="mt-1 truncate text-[11px] font-bold text-mahalyred/80" translate="no">{product.brandName}</p><div className="mt-2"><ProductPriceDisplay product={product} compact /></div></div>
                </div>
                <div className="mt-4"><ProductStatusBadges product={product} showReviewNotes /></div>
                <div className="mt-4 flex flex-col gap-3 border-t border-[#eee7de] pt-4 sm:flex-row sm:items-center sm:justify-between"><InventorySummary product={product} /><div className="self-end sm:self-auto"><AdminProductDeletionActions product={product} /></div></div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="px-5 py-14 text-center"><PackageOpen className="mx-auto h-6 w-6 text-[#a29489]" aria-hidden="true" /><h2 className="mt-3 text-[15px] font-bold text-[#302924]">{totalProducts ? "No matching products" : "No products yet"}</h2><p className="mx-auto mt-2 max-w-md text-[12px] leading-5 text-[#81746a]">{totalProducts ? "Clear or adjust the filters to return to the full catalog." : "Add the first product to start building the marketplace catalog."}</p>{totalProducts ? <Link href={clearHref} className="mt-4 inline-flex h-10 items-center rounded-xl border border-[#ddd6cd] px-4 text-[12px] font-semibold text-[#51473f] hover:bg-[#f7f2ec]">Clear filters</Link> : <Link href="/admin/products/new" className="mt-4 inline-flex h-10 items-center rounded-xl bg-mahalyred px-4 text-[12px] font-semibold text-white hover:bg-mahalyred-dark">Add product</Link>}</div>
      )}

      <ProductActionDialog
        open={confirmArchive}
        onClose={() => !busy && setConfirmArchive(false)}
        title={`Archive ${selected.size} ${selected.size === 1 ? "product" : "products"}?`}
        busy={busy}
        footer={<><button type="button" onClick={() => setConfirmArchive(false)} disabled={busy} className="h-10 rounded-xl border border-[#ddd6cd] bg-white px-4 text-[12.5px] font-semibold text-[#62564d] hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 disabled:opacity-50">Cancel</button><button type="button" onClick={() => runBulkAction("archive")} disabled={busy || !selected.size} className="h-10 rounded-xl bg-mahalyred px-4 text-[12.5px] font-semibold text-white hover:bg-mahalyred-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/30 disabled:opacity-50">{busy ? "Archiving…" : "Move to Archived"}</button></>}
      >
        <p className="text-[13px] leading-6 text-[#75685f]">Archived is final. These products will be hidden immediately and cannot be resumed or restored.</p>
        <ul className="mt-4 max-h-40 space-y-2 overflow-y-auto rounded-xl bg-[#faf7f4] p-3 text-[12px] font-semibold text-[#51473f]">{selectedProducts.slice(0, 6).map((product) => <li key={product.id} className="truncate">{product.name} <span className="font-normal text-[#94867c]">· {product.brandName}</span></li>)}{selectedProducts.length > 6 ? <li className="text-[#94867c]">+{selectedProducts.length - 6} more</li> : null}</ul>
      </ProductActionDialog>
    </section>
  );
}
