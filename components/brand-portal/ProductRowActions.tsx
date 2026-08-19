"use client";

import Link from "next/link";
import { Archive, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ProductStatus } from "@/types";
import type { ProductDeletionEligibility } from "@/lib/admin/productDeletion";
import ProductActionDialog from "@/components/products/ProductActionDialog";
import ProductOverflowMenu from "@/components/products/ProductOverflowMenu";

type PendingAction = "archive" | "delete_draft" | "delete_archived" | null;

type ProductRowActionsProps = {
  productId: string;
  name: string;
  editHref: string;
  status: ProductStatus;
  pausedByBrand: boolean;
};

const menuItemClass = "flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12.5px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset";

export default function ProductRowActions({ productId, name, editHref, status, pausedByBrand }: ProductRowActionsProps) {
  const router = useRouter();
  const operationKeyRef = useRef("");
  const [eligibility, setEligibility] = useState<ProductDeletionEligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadEligibility() {
    if (eligibility || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/brand-portal/products/${productId}/deletion`, { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setEligibility(data.eligibility);
    } finally {
      setLoading(false);
    }
  }

  async function togglePause() {
    setLoading(true);
    try {
      const query = editHref.includes("?") ? editHref.slice(editHref.indexOf("?")) : "";
      const response = await fetch(`/api/brand-portal/products/${productId}${query}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle-pause", pausedByBrand: !pausedByBrand }),
      });
      if (response.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  function open(action: Exclude<PendingAction, null>) {
    setPendingAction(action);
    setConfirmText("");
    setReason("");
    setError("");
    operationKeyRef.current = action.startsWith("delete_") ? crypto.randomUUID() : "";
  }

  async function confirm() {
    if (!pendingAction) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/brand-portal/products/${productId}/deletion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: pendingAction, reason, operationKey: operationKeyRef.current, confirmationName: confirmText }),
      });
      const data = await response.json();
      if (!response.ok) {
        const details = Array.isArray(data.blockers)
          ? data.blockers.map((blocker: { message: string; resolution?: string }) => `${blocker.message} ${blocker.resolution ?? ""}`).join(" ")
          : "";
        setError([data.error, details].filter(Boolean).join(" "));
        return;
      }
      setPendingAction(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const isDelete = pendingAction === "delete_draft" || pendingAction === "delete_archived";
  const canConfirm = !busy && (!isDelete || confirmText === name);

  return (
    <>
      <div className="flex items-center gap-1">
        {status === "published" ? (
          <button type="button" disabled={loading} onClick={togglePause} title={pausedByBrand ? "Resume" : "Pause temporarily"} aria-label={`${pausedByBrand ? "Resume" : "Pause"} ${name}`} className="flex h-10 w-10 items-center justify-center rounded-xl text-[#75685f] transition-colors duration-150 hover:bg-[#f1eae2] hover:text-[#242424] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 disabled:opacity-50">
            {pausedByBrand ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          </button>
        ) : null}

        <ProductOverflowMenu label={`More actions for ${name}`} onOpen={loadEligibility}>
          <Link role="menuitem" tabIndex={-1} href={editHref} className={`${menuItemClass} text-[#51473f] hover:bg-[#f7f0e8] focus-visible:ring-mahalyred/25`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />Edit product
          </Link>
          {loading ? <p className="px-3 py-2 text-[11.5px] text-[#8a7d73]" aria-live="polite">Checking product…</p> : null}
          {eligibility?.canArchive ? (
            <button role="menuitem" tabIndex={-1} type="button" onClick={() => open("archive")} className={`${menuItemClass} text-red-700 hover:bg-red-50 focus-visible:ring-red-300`}>
              <Archive className="h-4 w-4" aria-hidden="true" />Archive permanently
            </button>
          ) : null}
          {eligibility?.canDeleteDraft ? (
            <button role="menuitem" tabIndex={-1} type="button" onClick={() => open("delete_draft")} className={`${menuItemClass} text-red-700 hover:bg-red-50 focus-visible:ring-red-300`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />Delete pristine Draft
            </button>
          ) : null}
        </ProductOverflowMenu>
      </div>

      <ProductActionDialog
        open={Boolean(pendingAction)}
        onClose={() => !busy && setPendingAction(null)}
        title={pendingAction === "archive" ? `Archive ${name}?` : `Permanently delete ${name}?`}
        busy={busy}
        footer={<>
          <button type="button" onClick={() => setPendingAction(null)} disabled={busy} className="h-10 rounded-xl border border-[#ddd6cd] bg-white px-4 text-[12.5px] font-semibold text-[#62564d] transition-colors duration-150 hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={confirm} disabled={!canConfirm} className="h-10 rounded-xl bg-mahalyred px-4 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-mahalyred-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/30 disabled:opacity-50">
            {busy ? "Working…" : pendingAction === "archive" ? "Archive" : "Delete permanently"}
          </button>
        </>}
      >
        <p className="mt-2 text-[13px] leading-6 text-[#75685f]">
          {pendingAction === "archive"
            ? "This hides the product immediately. Archived is final; it cannot be resumed or restored."
            : "This cannot be undone. The product and its disposable catalog data will be permanently removed."}
        </p>
        {isDelete ? (
          <>
            <label className="mt-4 block text-[12px] font-semibold text-[#51473f]">Reason (optional)
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-[#ddd6cd] p-2.5 outline-none focus-visible:border-mahalyred/50 focus-visible:ring-4 focus-visible:ring-mahalyred/10" />
            </label>
            <label className="mt-4 block text-[12px] font-semibold text-[#51473f]">Type <strong>{name}</strong> to confirm
              <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" className="mt-1.5 h-11 w-full rounded-lg border border-[#ddd6cd] px-3 outline-none focus-visible:border-mahalyred/50 focus-visible:ring-4 focus-visible:ring-mahalyred/10" />
            </label>
          </>
        ) : null}
        {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-[12px] leading-5 text-red-700">{error}</p> : null}
      </ProductActionDialog>
    </>
  );
}
