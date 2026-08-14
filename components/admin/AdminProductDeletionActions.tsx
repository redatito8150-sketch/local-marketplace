"use client";

import Link from "next/link";
import { Archive, Pause, Play, ShieldAlert, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { DeletionBlocker, ProductDeletionEligibility } from "@/lib/admin/productDeletion";
import { getAdminDeletionBlockerHref } from "@/lib/admin/productDeletionLinks";
import type { ProductRecord } from "@/types";

type LifecycleAction = "archive" | "delete_draft" | "archive_dirty_draft";

export default function AdminProductDeletionActions({ product }: { product: ProductRecord }) {
  const router = useRouter();
  const operationKeyRef = useRef("");
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [blockers, setBlockers] = useState<DeletionBlocker[]>([]);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function togglePause() {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/products/${product.id}/pause`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !product.pausedByBrand }),
      });
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function inspectDraft() {
    setAction("delete_draft");
    setConfirmText("");
    setReason("");
    setBlockers([]);
    setError("");
    setChecking(true);
    operationKeyRef.current = crypto.randomUUID();

    try {
      const response = await fetch(`/api/admin/products/${product.id}/deletion`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "The deletion check could not be completed.");
        return;
      }

      const eligibility = data.eligibility as ProductDeletionEligibility;
      if (!eligibility.canDeleteDraft) {
        setAction("archive_dirty_draft");
        setBlockers(eligibility.blockers ?? []);
      }
    } finally {
      setChecking(false);
    }
  }

  async function confirm() {
    if (!action) return;
    setBusy(true);
    setError("");
    try {
      const response = action === "archive"
        ? await fetch("/api/admin/products/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [product.id], action: "archive" }),
          })
        : action === "archive_dirty_draft"
          ? await fetch(`/api/admin/products/${product.id}/emergency-hide`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason: reason.trim() }),
            })
          : await fetch(`/api/admin/products/${product.id}/deletion`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "delete_draft",
                operationKey: operationKeyRef.current,
                confirmationName: confirmText,
              }),
            });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.failed?.length) {
        const nextBlockers = Array.isArray(data.blockers) ? data.blockers as DeletionBlocker[] : [];
        if (action === "delete_draft" && nextBlockers.length) {
          setAction("archive_dirty_draft");
          setBlockers(nextBlockers);
          setConfirmText("");
          setError("The Draft changed after the check and can no longer be deleted. Archive it to preserve its history.");
          return;
        }
        setError(data.error ?? data.failed?.[0]?.message ?? "That action could not be completed.");
        if (nextBlockers.length) setBlockers(nextBlockers);
        return;
      }
      setAction(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function openArchive() {
    setAction("archive");
    setConfirmText("");
    setReason("");
    setBlockers([]);
    setError("");
    operationKeyRef.current = "";
  }

  if (product.status === "archived") return null;

  const isDirtyDraftArchive = action === "archive_dirty_draft";
  const title = action === "archive"
    ? `Archive ${product.name}?`
    : isDirtyDraftArchive
      ? `Archive ${product.name} instead?`
      : `Permanently delete ${product.name}?`;

  return <>
    <div className="flex items-center gap-1">
      {product.status === "published" && <button type="button" disabled={busy} onClick={togglePause} title={product.pausedByBrand ? "Resume" : "Pause temporarily"} aria-label={`${product.pausedByBrand ? "Resume" : "Pause"} ${product.name}`} className="rounded-md p-1.5 text-ink-soft/60 hover:bg-stone-100 hover:text-ink">{product.pausedByBrand ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>}
      {product.status === "published" && <button type="button" onClick={openArchive} title="Archive permanently" aria-label={`Archive ${product.name}`} className="rounded-md p-1.5 text-ink-soft/60 hover:bg-stone-100 hover:text-ink"><Archive className="h-4 w-4" /></button>}
      {product.status === "draft" && <button type="button" disabled={checking} onClick={inspectDraft} title="Check Draft deletion" aria-label={`Delete ${product.name}`} className="rounded-md p-1.5 text-ink-soft/60 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}
    </div>

    {action && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => !busy && setAction(null)} aria-label="Close" />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <button type="button" onClick={() => setAction(null)} className="absolute right-4 top-4 rounded-lg p-2 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
        <h2 className="pr-10 text-lg font-bold">{title}</h2>

        {checking ? <p className="mt-3 text-[13px] text-slate-600">Checking product history and stock…</p> : <>
          <p className="mt-2 text-[13px] leading-6 text-slate-600">
            {action === "archive"
              ? "Archived is final. The product is hidden immediately and cannot be resumed or restored."
              : isDirtyDraftArchive
                ? "This Draft is no longer pristine, so permanent deletion would break its business history. Moving it to Archived removes it from the working catalog while preserving the required records."
                : "The database found no stock or business history. This Draft can be permanently deleted and the action cannot be undone."}
          </p>

          {isDirtyDraftArchive && blockers.length > 0 && <div className="mt-4 space-y-2 rounded-xl border border-[#eadfd8] bg-[#fffaf7] p-3">
            {blockers.map((blocker) => {
              const blockerHref = getAdminDeletionBlockerHref(blocker, product.id);
              return <div key={blocker.code} className="flex gap-2 text-[12px] leading-5 text-[#51473f]">
                <ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-[#C85956]" />
                <div>
                  <p className="font-semibold">{blocker.message}</p>
                  <p className="text-[#75685f]">{blocker.resolution}</p>
                  {blockerHref && <Link href={blockerHref} className="font-semibold text-[#C85956] hover:underline">Open related area</Link>}
                </div>
              </div>;
            })}
          </div>}

          {action === "delete_draft" && <label className="mt-4 block text-[12px] font-semibold">Type <strong>{product.name}</strong> to confirm<input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} className="mt-1.5 w-full rounded-lg border p-2.5" /></label>}
          {isDirtyDraftArchive && <label className="mt-4 block text-[12px] font-semibold">Archive reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} placeholder="Why this non-pristine Draft is being Archived" className="mt-1.5 w-full rounded-lg border p-2.5" /></label>}
        </>}

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => setAction(null)} className="h-10 rounded-lg border px-4 text-[12.5px] font-semibold">Cancel</button>
          <button type="button" onClick={confirm} disabled={busy || checking || (action === "delete_draft" && confirmText !== product.name) || (isDirtyDraftArchive && !reason.trim())} className="h-10 rounded-lg bg-[#C85956] px-4 text-[12.5px] font-semibold text-white disabled:opacity-50">
            {busy ? "Working…" : action === "archive" || isDirtyDraftArchive ? "Move to Archived" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>}
  </>;
}
