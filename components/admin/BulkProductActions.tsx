"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Star } from "lucide-react";
import type { ProductRecord } from "@/types";
import { formatPrice } from "@/lib/format";
import AdminProductDeletionActions from "@/components/admin/AdminProductDeletionActions";
import { draftDaysRemaining } from "@/lib/admin/expireDrafts";
import { isPublishDateLive } from "@/lib/newArrivals";

function StatusCell({ product }: { product: ProductRecord }) {
  if (product.status === "draft") {
    const daysLeft = draftDaysRemaining(product.draftStartedAt);
    return (
      <span
        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
          daysLeft != null && daysLeft <= 3 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
        }`}
        title={daysLeft != null ? "Draft review is due soon. Publish it or permanently delete it if it is still pristine." : undefined}
      >
        Draft{daysLeft != null ? ` — ${Math.max(daysLeft, 0)}d left` : ""}
      </span>
    );
  }
  if (product.status === "archived") {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-ink-soft/65">Archived</span>
      </div>
    );
  }
  // A "published" row with a future Publish Date isn't actually live yet —
  // same gate the storefront queries use (lib/newArrivals.ts). Plain
  // "Published" here would mislead the admin into thinking it's already
  // visible to customers.
  if (product.status === "published" && !isPublishDateLive(product.publishDate ?? null)) {
    return (
      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700" title={product.publishDate}>
        Scheduled — {new Date(product.publishDate!).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </span>
    );
  }
  return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Published</span>;
}

function existingNameById(products: ProductRecord[], id: string): string {
  return products.find((p) => p.id === id)?.name ?? id;
}

export default function BulkProductActions({ products }: { products: ProductRecord[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === products.length ? new Set() : new Set(products.map((p) => p.id))));
  };

  const [bulkResult, setBulkResult] = useState<{ succeeded: string[]; failed: { productId: string; message: string }[] } | null>(null);

  const runBulkAction = async (action: "publish" | "archive") => {
    setBusy(true);
    setBulkResult(null);
    try {
      const res = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "Bulk action failed");
        return;
      }
      // Structured per-product outcome — never a blind "N affected." A
      // publish/archive bulk update reports `succeeded` as every id whose
      // row was actually changed (see the route's .select("id") after the
      // update); Archive reports a real per-product `failed`
      // list with the exact blocker reason for anything the database
      // refused (e.g. history that must be retained).
      setBulkResult({ succeeded: data.succeeded ?? [], failed: data.failed ?? [] });
      setSelected(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  // Featured is admin-list-only merchandising — a single-product toggle,
  // not a selection-driven bulk action, but it reuses the same endpoint.
  const toggleFeatured = async (id: string, nextFeatured: boolean) => {
    setTogglingId(id);
    try {
      const res = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], action: nextFeatured ? "feature" : "unfeature" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to update Featured");
        return;
      }
      router.refresh();
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      {selected.size > 0 && (
        <div className="flex min-w-[920px] items-center justify-between gap-4 border-b border-slate-200 bg-red-50/60 px-5 py-3">
          <span className="text-[13px] font-medium text-ink">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => runBulkAction("publish")}
              className="rounded-md border border-stone-150 bg-white px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-stone-50 disabled:opacity-60"
            >
              Publish
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runBulkAction("archive")}
              className="rounded-md border border-stone-150 bg-white px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-stone-50 disabled:opacity-60"
            >
              Archive
            </button>
          </div>
        </div>
      )}

      {bulkResult && (
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-[12.5px]">
          {bulkResult.succeeded.length > 0 && (
            <p className="text-emerald-700">{bulkResult.succeeded.length} product(s) updated successfully.</p>
          )}
          {bulkResult.failed.length > 0 && (
            <div className="mt-1 text-red-700">
              <p className="font-semibold">{bulkResult.failed.length} could not be processed:</p>
              <ul className="mt-1 list-disc pl-5">
                {bulkResult.failed.map((f) => (
                  <li key={f.productId}>{existingNameById(products, f.productId)}: {f.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <table className="w-full min-w-[920px] text-left text-[13px]">
        <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-[10.5px] uppercase tracking-[0.08em] text-slate-500 backdrop-blur">
          <tr>
            <th className="w-10 px-5 py-3">
              <input
                type="checkbox"
                checked={products.length > 0 && selected.size === products.length}
                onChange={toggleAll}
                aria-label="Select all products"
              />
            </th>
            <th className="px-5 py-3 font-medium">Product</th>
            <th className="px-5 py-3 font-medium">Brand</th>
            <th className="px-5 py-3 font-medium">Category</th>
            <th className="px-5 py-3 font-medium">Price</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Stock</th>
            <th className="px-5 py-3 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-150">
          {products.map((product) => (
            <tr key={product.id} className="transition-colors hover:bg-slate-50/70">
              <td className="px-5 py-3">
                <input
                  type="checkbox"
                  checked={selected.has(product.id)}
                  onChange={() => toggleOne(product.id)}
                  aria-label={`Select ${product.name}`}
                />
              </td>
              <td className="flex items-center gap-3 px-5 py-3">
                <div className="h-10 w-10 overflow-hidden rounded-md bg-stone-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={product.image}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div><p className="font-bold text-slate-900">{product.name}</p><p className="mt-0.5 text-[10.5px] text-slate-400">{product.sku}</p></div>
              </td>
              <td className="px-5 py-3 text-ink-soft/70">{product.brandName}</td>
              <td className="px-5 py-3 capitalize text-ink-soft/70">
                {product.mainCategory || "—"}
              </td>
              <td className="px-5 py-3 font-medium text-ink">
                {formatPrice(product.price, product.currency)}
              </td>
              <td className="px-5 py-3">
                <StatusCell product={product} />
              </td>
              <td className="px-5 py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    product.inStock
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {product.inStock ? "In stock" : "Out of stock"}
                </span>
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    disabled={togglingId === product.id}
                    onClick={() => toggleFeatured(product.id, !product.featured)}
                    aria-label={product.featured ? `Unfeature ${product.name}` : `Feature ${product.name}`}
                    aria-pressed={product.featured}
                    title={product.featured ? "Featured — click to unfeature" : "Not featured — click to feature"}
                    className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-stone-100 hover:text-ink disabled:opacity-50"
                  >
                    <Star className="h-4 w-4" strokeWidth={1.6} fill={product.featured ? "#C85956" : "none"} color={product.featured ? "#C85956" : "currentColor"} />
                  </button>
                  <Link
                    href={`/admin/products/${product.id}/edit`}
                    aria-label={`Edit ${product.name}`}
                    className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-stone-100 hover:text-ink"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.6} />
                  </Link>
                  <AdminProductDeletionActions product={product} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {products.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-ink-soft/60">
          No products yet.
        </p>
      )}
    </div>
  );
}
