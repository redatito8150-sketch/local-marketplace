"use client";

import Link from "next/link";
import { Pause, Pencil, Play, ShieldAlert, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { DeletionBlocker, ProductDeletionEligibility } from "@/lib/admin/productDeletion";
import { getAdminDeletionBlockerDestination } from "@/lib/admin/productDeletionLinks";
import ProductLifecycleDialog from "@/components/shared/ProductLifecycleDialog";
import type { ProductRecord } from "@/types";
import ProductActionDialog from "@/components/products/ProductActionDialog";
import ProductOverflowMenu from "@/components/products/ProductOverflowMenu";

type DraftAction = "delete_draft" | "archive_dirty_draft";

const menuItemClass = "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12.5px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset";

export default function AdminProductDeletionActions({ product }: { product: ProductRecord }) {
  const router = useRouter();
  const operationKeyRef = useRef("");
  const [draftAction, setDraftAction] = useState<DraftAction | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [blockers, setBlockers] = useState<DeletionBlocker[]>([]);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [pauseBusy, setPauseBusy] = useState(false);
  const [lifecycleDialogOpen, setLifecycleDialogOpen] = useState(false);

  const apiPath = `/api/admin/products/${product.id}/deletion`;
  const isLive = product.status === "published" || product.status === "paused";

  async function toggleFeatured() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [product.id], action: product.featured ? "unfeature" : "feature" }),
      });
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    setPauseBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/products/${product.id}/pause`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: product.status !== "paused" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setError(data.error ?? "The product status could not be changed.");
      else router.refresh();
    } finally {
      setPauseBusy(false);
    }
  }

  async function inspectDraft() {
    setDraftAction("delete_draft");
    setConfirmText("");
    setReason("");
    setBlockers([]);
    setError("");
    setChecking(true);
    operationKeyRef.current = crypto.randomUUID();
    try {
      const response = await fetch(apiPath, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "The deletion check could not be completed.");
        return;
      }
      const eligibility = data.eligibility as ProductDeletionEligibility;
      if (!eligibility.canDeleteDraft) {
        setDraftAction("archive_dirty_draft");
        setBlockers(eligibility.blockers ?? []);
      }
    } finally {
      setChecking(false);
    }
  }

  async function confirmDraftAction() {
    if (!draftAction) return;
    setBusy(true);
    setError("");
    try {
      const response = draftAction === "archive_dirty_draft"
        ? await fetch(`/api/admin/products/${product.id}/emergency-hide`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: reason.trim() }),
          })
        : await fetch(apiPath, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete_draft", operationKey: operationKeyRef.current, confirmationName: confirmText }),
          });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.failed?.length) {
        const nextBlockers = Array.isArray(data.blockers) ? data.blockers as DeletionBlocker[] : [];
        if (draftAction === "delete_draft" && nextBlockers.length) {
          setDraftAction("archive_dirty_draft");
          setBlockers(nextBlockers);
          setConfirmText("");
          setError("The Draft changed after the check and can no longer be deleted. Archive it to preserve its history.");
          return;
        }
        setError(data.error ?? data.failed?.[0]?.message ?? "That action could not be completed.");
        if (nextBlockers.length) setBlockers(nextBlockers);
        return;
      }
      setDraftAction(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (product.status === "archived") return null;

  const isDirtyDraftArchive = draftAction === "archive_dirty_draft";
  const draftTitle = isDirtyDraftArchive ? `Archive ${product.name} instead?` : `Permanently delete ${product.name}?`;

  return (
    <>
      <div className="flex items-center gap-1">
        {isLive ? (
          <button type="button" disabled={pauseBusy} onClick={togglePause} title={product.status === "paused" ? "Resume" : "Pause temporarily"} aria-label={`${product.status === "paused" ? "Resume" : "Pause"} ${product.name}`} className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft/60 transition-colors duration-150 hover:bg-stone-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 disabled:opacity-50">
            {product.status === "paused" ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          </button>
        ) : null}
        <ProductOverflowMenu label={`More actions for ${product.name}`}>
          <button role="menuitem" tabIndex={-1} type="button" disabled={busy} onClick={toggleFeatured} className={`${menuItemClass} text-[#51473f] hover:bg-[#f7f0e8] focus-visible:ring-mahalyred/25 disabled:opacity-50`}>
            <Star className="h-4 w-4" fill={product.featured ? "currentColor" : "none"} aria-hidden="true" />{product.featured ? "Remove from Featured" : "Add to Featured"}
          </button>
          <Link role="menuitem" tabIndex={-1} href={`/admin/products/${product.id}/edit`} className={`${menuItemClass} text-[#51473f] hover:bg-[#f7f0e8] focus-visible:ring-mahalyred/25`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />Edit product
          </Link>
          {isLive ? (
            <button role="menuitem" tabIndex={-1} type="button" onClick={() => setLifecycleDialogOpen(true)} className={`${menuItemClass} text-red-700 hover:bg-red-50 focus-visible:ring-red-300`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />Delete permanently
            </button>
          ) : null}
          {product.status === "draft" ? (
            <button role="menuitem" tabIndex={-1} type="button" disabled={checking} onClick={inspectDraft} className={`${menuItemClass} text-red-700 hover:bg-red-50 focus-visible:ring-red-300 disabled:opacity-50`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />Delete Draft
            </button>
          ) : null}
        </ProductOverflowMenu>
      </div>

      <ProductActionDialog open={Boolean(draftAction)} onClose={() => !busy && setDraftAction(null)} title={draftTitle} busy={busy} footer={(
        <>
          <button type="button" onClick={() => setDraftAction(null)} disabled={busy} className="h-10 rounded-xl border border-[#ddd6cd] bg-white px-4 text-[12.5px] font-semibold text-[#62564d] transition-colors duration-150 hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={confirmDraftAction} disabled={busy || checking || (draftAction === "delete_draft" && confirmText !== product.name) || (isDirtyDraftArchive && !reason.trim())} className="h-10 rounded-xl bg-mahalyred px-4 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-mahalyred-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/30 disabled:opacity-50">
            {busy ? "Working…" : isDirtyDraftArchive ? "Move to Archived" : "Delete permanently"}
          </button>
        </>
      )}>
        {checking ? <p className="text-[13px] text-slate-600" aria-live="polite">Checking product history and stock…</p> : (
          <>
            <p className="text-[13px] leading-6 text-slate-600">{isDirtyDraftArchive ? "This Draft is no longer pristine, so permanent deletion would break its business history. Moving it to Archived removes it from the working catalog while preserving the required records." : "The database found no stock or business history. This Draft can be permanently deleted and the action cannot be undone."}</p>
            {isDirtyDraftArchive && blockers.length ? <div className="mt-4 space-y-2 rounded-xl border border-[#eadfd8] bg-[#fffaf7] p-3">{blockers.map((blocker) => {
              const destination = getAdminDeletionBlockerDestination(blocker, product.id);
              return <div key={blocker.code} className="flex gap-2 text-[12px] leading-5 text-[#51473f]"><ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-[#C85956]" aria-hidden="true" /><div><p className="font-semibold">{blocker.message}</p><p className="text-[#75685f]">{blocker.resolution}</p>{destination ? <Link href={destination.href} className="rounded font-semibold text-[#C85956] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">{destination.label}</Link> : null}</div></div>;
            })}</div> : null}
            {draftAction === "delete_draft" ? <label className="mt-4 block text-[12px] font-semibold">Type <strong>{product.name}</strong> to confirm<input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" className="mt-1.5 h-11 w-full rounded-xl border border-[#ddd6cd] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25" /></label> : null}
            {isDirtyDraftArchive ? <label className="mt-4 block text-[12px] font-semibold">Archive reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} placeholder="Explain why this Draft must be Archived…" className="mt-1.5 w-full rounded-xl border border-[#ddd6cd] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25" /></label> : null}
          </>
        )}
        {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-[12px] text-red-700">{error}</p> : null}
      </ProductActionDialog>

      <ProductLifecycleDialog open={lifecycleDialogOpen} onClose={() => setLifecycleDialogOpen(false)} onSuccess={() => router.refresh()} productId={product.id} productName={product.name} apiPath={apiPath} canDeletePermanently resolveBlockerDestination={(blocker) => getAdminDeletionBlockerDestination(blocker, product.id)} restrictedDeleteMessage="Only an authorized admin can permanently delete a product." />
    </>
  );
}
