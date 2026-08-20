"use client";

import Link from "next/link";
import { Archive, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { DeletionBlocker, ProductDeletionEligibility } from "@/lib/admin/productDeletion";
import {
  getBrandDeletionBlockerDestination,
  getBrandDeletionBlockerNotice,
} from "@/lib/brand-portal/productDeletionLinks";
import ProductLifecycleDialog from "@/components/shared/ProductLifecycleDialog";
import ProductActionDialog from "@/components/products/ProductActionDialog";
import ProductOverflowMenu from "@/components/products/ProductOverflowMenu";
import type { ProductStatus } from "@/types";

type ProductRowActionsProps = {
  productId: string;
  name: string;
  editHref: string;
  status: ProductStatus;
  brandParam: string;
  canDeletePermanently: boolean;
};

const menuItemClass = "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12.5px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset";

export default function ProductRowActions({ productId, name, editHref, status, brandParam, canDeletePermanently }: ProductRowActionsProps) {
  const router = useRouter();
  const operationKeyRef = useRef("");
  const [eligibility, setEligibility] = useState<ProductDeletionEligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [lifecycleDialogOpen, setLifecycleDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pauseBusy, setPauseBusy] = useState(false);

  const apiPath = `/api/brand-portal/products/${productId}/deletion${brandParam}`;
  const isLive = status === "published" || status === "paused";

  async function loadEligibility() {
    if (eligibility || loading) return;
    setLoading(true);
    try {
      const response = await fetch(apiPath, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setEligibility(data.eligibility as ProductDeletionEligibility);
    } finally {
      setLoading(false);
    }
  }

  async function togglePause() {
    setPauseBusy(true);
    setError("");
    try {
      const query = editHref.includes("?") ? editHref.slice(editHref.indexOf("?")) : "";
      const response = await fetch(`/api/brand-portal/products/${productId}${query}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle-pause", paused: status !== "paused" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setError(data.error ?? "The product status could not be changed.");
      else router.refresh();
    } finally {
      setPauseBusy(false);
    }
  }

  function openDraftDelete() {
    operationKeyRef.current = crypto.randomUUID();
    setConfirmText("");
    setReason("");
    setError("");
    setDraftDialogOpen(true);
  }

  async function confirmDraftDelete() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_draft", reason, operationKey: operationKeyRef.current, confirmationName: confirmText }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        const details = Array.isArray(data.blockers)
          ? data.blockers.map((blocker: DeletionBlocker) => `${blocker.message} ${blocker.resolution ?? ""}`).join(" ")
          : "";
        setError([data.error, details].filter(Boolean).join(" "));
        return;
      }
      setDraftDialogOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        {isLive ? (
          <button type="button" disabled={pauseBusy} onClick={togglePause} title={status === "paused" ? "Resume" : "Pause temporarily"} aria-label={`${status === "paused" ? "Resume" : "Pause"} ${name}`} className="flex h-10 w-10 items-center justify-center rounded-xl text-[#75685f] transition-colors duration-150 hover:bg-[#f1eae2] hover:text-[#242424] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 disabled:opacity-50">
            {status === "paused" ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          </button>
        ) : null}
        <ProductOverflowMenu label={`More actions for ${name}`} onOpen={loadEligibility}>
          <Link role="menuitem" tabIndex={-1} href={editHref} className={`${menuItemClass} text-[#51473f] hover:bg-[#f7f0e8] focus-visible:ring-mahalyred/25`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />Edit product
          </Link>
          {loading ? <p className="px-3 py-2 text-[11.5px] text-[#8a7d73]" aria-live="polite">Checking product…</p> : null}
          {isLive ? (
            <button role="menuitem" tabIndex={-1} type="button" onClick={() => setLifecycleDialogOpen(true)} className={`${menuItemClass} text-red-700 hover:bg-red-50 focus-visible:ring-red-300`}>
              {canDeletePermanently ? <Trash2 className="h-4 w-4" aria-hidden="true" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
              {canDeletePermanently ? "Delete permanently" : "Review removal options"}
            </button>
          ) : null}
          {status === "draft" && canDeletePermanently && eligibility?.canDeleteDraft ? (
            <button role="menuitem" tabIndex={-1} type="button" onClick={openDraftDelete} className={`${menuItemClass} text-red-700 hover:bg-red-50 focus-visible:ring-red-300`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />Delete Draft
            </button>
          ) : null}
        </ProductOverflowMenu>
      </div>

      <ProductActionDialog open={draftDialogOpen} onClose={() => !busy && setDraftDialogOpen(false)} title={`Permanently delete ${name}?`} busy={busy} footer={(
        <>
          <button type="button" onClick={() => setDraftDialogOpen(false)} disabled={busy} className="h-10 rounded-xl border border-[#ddd6cd] bg-white px-4 text-[12.5px] font-semibold text-[#62564d] transition-colors duration-150 hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={confirmDraftDelete} disabled={busy || confirmText !== name} className="h-10 rounded-xl bg-mahalyred px-4 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-mahalyred-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/30 disabled:opacity-50">{busy ? "Deleting…" : "Delete permanently"}</button>
        </>
      )}>
        <p className="text-[13px] leading-6 text-[#75685f]">This pristine Draft has no stock or business history. Deletion is immediate and cannot be undone.</p>
        <label className="mt-4 block text-[12px] font-semibold text-[#51473f]">Reason (optional)<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-[#ddd6cd] p-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25" /></label>
        <label className="mt-4 block text-[12px] font-semibold text-[#51473f]">Type <strong>{name}</strong> to confirm<input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" className="mt-1.5 h-11 w-full rounded-lg border border-[#ddd6cd] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25" /></label>
        {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-[12px] leading-5 text-red-700">{error}</p> : null}
      </ProductActionDialog>

      <ProductLifecycleDialog open={lifecycleDialogOpen} onClose={() => setLifecycleDialogOpen(false)} onSuccess={() => router.refresh()} productId={productId} productName={name} apiPath={apiPath} canDeletePermanently={canDeletePermanently} resolveBlockerDestination={(blocker) => getBrandDeletionBlockerDestination(blocker, brandParam)} resolveBlockerNotice={getBrandDeletionBlockerNotice} restrictedDeleteMessage="Only the brand owner can permanently delete a product." />
    </>
  );
}
