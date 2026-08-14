"use client";

import { Archive, Pause, Play, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ProductRecord } from "@/types";

export default function AdminProductDeletionActions({ product }: { product: ProductRecord }) {
  const router = useRouter();
  const operationKeyRef = useRef("");
  const [action, setAction] = useState<"archive" | "delete_draft" | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function togglePause() {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/products/${product.id}/pause`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: !product.pausedByBrand }) });
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!action) return;
    setBusy(true);
    setError("");
    try {
      const response = action === "archive"
        ? await fetch("/api/admin/products/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [product.id], action: "archive" }) })
        : await fetch(`/api/admin/products/${product.id}/deletion`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_draft", operationKey: operationKeyRef.current, confirmationName: confirmText }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.failed?.length) {
        setError(data.error ?? data.failed?.[0]?.message ?? "That action could not be completed.");
        return;
      }
      setAction(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function open(next: "archive" | "delete_draft") {
    setAction(next);
    setConfirmText("");
    setError("");
    operationKeyRef.current = next === "delete_draft" ? crypto.randomUUID() : "";
  }

  if (product.status === "archived") return null;
  return <>
    <div className="flex items-center gap-1">
      {product.status === "published" && <button type="button" disabled={busy} onClick={togglePause} title={product.pausedByBrand ? "Resume" : "Pause temporarily"} aria-label={`${product.pausedByBrand ? "Resume" : "Pause"} ${product.name}`} className="rounded-md p-1.5 text-ink-soft/60 hover:bg-stone-100 hover:text-ink">{product.pausedByBrand ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>}
      <button type="button" onClick={() => open("archive")} title="Archive permanently" aria-label={`Archive ${product.name}`} className="rounded-md p-1.5 text-ink-soft/60 hover:bg-stone-100 hover:text-ink"><Archive className="h-4 w-4" /></button>
      {product.status === "draft" && <button type="button" onClick={() => open("delete_draft")} title="Delete pristine Draft" aria-label={`Delete ${product.name}`} className="rounded-md p-1.5 text-ink-soft/60 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>}
    </div>
    {action && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => !busy && setAction(null)} aria-label="Close" />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <button type="button" onClick={() => setAction(null)} className="absolute right-4 top-4 rounded-lg p-2 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
        <h2 className="pr-10 text-lg font-bold">{action === "archive" ? `Archive ${product.name}?` : `Permanently delete ${product.name}?`}</h2>
        <p className="mt-2 text-[13px] leading-6 text-slate-600">{action === "archive" ? "Archived is final. The product is hidden immediately and cannot be resumed or restored." : "Only a completely pristine Draft can be deleted. This cannot be undone."}</p>
        {action === "delete_draft" && <label className="mt-4 block text-[12px] font-semibold">Type <strong>{product.name}</strong> to confirm<input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} className="mt-1.5 w-full rounded-lg border p-2.5" /></label>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setAction(null)} className="h-10 rounded-lg border px-4 text-[12.5px] font-semibold">Cancel</button><button type="button" onClick={confirm} disabled={busy || (action === "delete_draft" && confirmText !== product.name)} className="h-10 rounded-lg bg-[#C85956] px-4 text-[12.5px] font-semibold text-white disabled:opacity-50">{busy ? "Working…" : action === "archive" ? "Archive" : "Delete permanently"}</button></div>
      </div>
    </div>}
  </>;
}
