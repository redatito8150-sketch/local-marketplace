"use client";

import Link from "next/link";
import { Lock, LockOpen, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { DeletionBlocker, ProductDeletionEligibility } from "@/lib/admin/productDeletion";
import { getAdminDeletionBlockerDestination } from "@/lib/admin/productDeletionLinks";
import {
  getBrandDeletionBlockerDestination,
  getBrandDeletionBlockerNotice,
} from "@/lib/brand-portal/productDeletionLinks";
import ProductActionDialog from "@/components/products/ProductActionDialog";

export default function ArchivedProductRowActions({
  productId,
  productName,
  eligibility,
  audience,
  brandParam = "",
  readOnly = false,
  allowRestore = false,
}: {
  productId: string;
  productName: string;
  eligibility: ProductDeletionEligibility;
  audience: "admin" | "brand";
  brandParam?: string;
  readOnly?: boolean;
  allowRestore?: boolean;
}) {
  const router = useRouter();
  const operationKeyRef = useRef("");
  const restoreOperationKeyRef = useRef("");
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [holdBusy, setHoldBusy] = useState(false);
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [holdError, setHoldError] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreReason, setRestoreReason] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState("");

  async function permanentlyDelete() {
    setBusy(true);
    setError("");
    try {
      const endpoint = audience === "admin"
        ? `/api/admin/products/${productId}/deletion`
        : `/api/brand-portal/products/${productId}/deletion`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_archived", reason, operationKey: operationKeyRef.current, confirmationName: confirmText }),
      });
      const data = await response.json();
      if (!response.ok) {
        const details = Array.isArray(data.blockers)
          ? data.blockers.map((blocker: { message: string; resolution?: string }) => `${blocker.message} ${blocker.resolution ?? ""}`).join(" ")
          : "";
        setError([data.error, details].filter(Boolean).join(" "));
        return;
      }
      setConfirming(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Admin-only, dedicated endpoint — never the generic PATCH route, which
  // the archived-transition trigger refuses outright for anyone except
  // this RPC. Lands the product on Paused, never Published, so restoring
  // never makes it visible as a side effect.
  async function confirmRestore() {
    if (!restoreReason.trim()) return;
    setRestoreBusy(true);
    setRestoreError("");
    try {
      const response = await fetch(`/api/admin/products/${productId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: restoreReason.trim(), operationKey: restoreOperationKeyRef.current }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        setRestoreError(data.error ?? "This product could not be restored.");
        return;
      }
      setRestoring(false);
      router.refresh();
    } finally {
      setRestoreBusy(false);
    }
  }

  async function toggleHold() {
    if (audience !== "admin") return;
    if (!eligibility.hasActiveHold) {
      setHoldReason("");
      setHoldError("");
      setHoldDialogOpen(true);
      return;
    }
    setHoldBusy(true);
    try {
      const response = await fetch(`/api/admin/products/${productId}/deletion-hold`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) router.refresh();
    } finally {
      setHoldBusy(false);
    }
  }

  async function applyHold() {
    if (!holdReason.trim()) return;
    setHoldBusy(true);
    setHoldError("");
    try {
      const response = await fetch(`/api/admin/products/${productId}/deletion-hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: holdReason.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setHoldError(data.error ?? "The hold could not be applied. Check your access and try again.");
        return;
      }
      setHoldDialogOpen(false);
      router.refresh();
    } finally {
      setHoldBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {audience === "admin" && !readOnly && (
          <button type="button" disabled={holdBusy} onClick={toggleHold} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ddd6cd] px-3 text-[11.5px] font-semibold text-[#51473f] hover:bg-[#f7f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 disabled:opacity-50">
            {eligibility.hasActiveHold ? <LockOpen className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
            {eligibility.hasActiveHold ? "Release hold" : "Apply hold"}
          </button>
        )}
        {eligibility.canDeleteArchived && !readOnly && (
          <button type="button" onClick={() => { operationKeyRef.current = crypto.randomUUID(); setConfirming(true); setConfirmText(""); setReason(""); setError(""); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-700 px-3 text-[11.5px] font-semibold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete permanently
          </button>
        )}
        {/* Admin-only. A Brand Owner/Assistant never sees this — they are
            told to contact an admin instead (see the read-only Archived
            list copy). */}
        {audience === "admin" && allowRestore && !readOnly && eligibility.canRestore && (
          <button
            type="button"
            onClick={() => { restoreOperationKeyRef.current = crypto.randomUUID(); setRestoring(true); setRestoreReason(""); setRestoreError(""); }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ddd6cd] px-3 text-[11.5px] font-semibold text-[#51473f] hover:bg-[#f7f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Restore
          </button>
        )}
      </div>

      {(eligibility.mustRetainHistory || eligibility.hasTemporaryBlockers) && (
        <details className="max-w-xl text-left">
          <summary className="cursor-pointer list-none rounded text-[11.5px] font-semibold text-[#C85956] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">
            {eligibility.hasTemporaryBlockers
              ? `Resolve ${eligibility.temporaryBlockers.length} blocker${eligibility.temporaryBlockers.length === 1 ? "" : "s"}`
              : "Why this stays Archived"}
          </summary>
          <div className="mt-2 space-y-2 rounded-xl border border-[#e3dcd3] bg-[#fffdf9] p-3">
            {eligibility.hasTemporaryBlockers ? (
              <ArchivedBlockerGroup title="Temporary Blockers" blockers={eligibility.temporaryBlockers} audience={audience} productId={productId} brandParam={brandParam} />
            ) : null}
            {eligibility.immutableReasons.length > 0 ? (
              <ArchivedBlockerGroup title={eligibility.hasTemporaryBlockers ? "Permanent Business History" : undefined} blockers={eligibility.immutableReasons} audience={audience} productId={productId} brandParam={brandParam} />
            ) : null}
          </div>
        </details>
      )}

      {audience === "admin" && eligibility.restoreBlockers.length > 0 ? (
        <details className="max-w-xl text-left">
          <summary className="cursor-pointer list-none rounded text-[11.5px] font-semibold text-amber-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">Why Restore is unavailable</summary>
          <div className="mt-2 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            {eligibility.restoreBlockers.map((blocker) => {
              const destination = getAdminDeletionBlockerDestination(blocker, productId);
              return <div key={blocker.code} className="flex gap-2 text-[11.5px] leading-5 text-[#51473f]"><ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-amber-700" aria-hidden="true" /><div><p className="font-semibold">{blocker.message}</p><p className="text-[#75685f]">{blocker.resolution}</p>{destination ? <Link href={destination.href} className="rounded font-semibold text-[#C85956] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">{destination.label}</Link> : null}</div></div>;
            })}
          </div>
        </details>
      ) : null}

      <ProductActionDialog
        open={holdDialogOpen}
        onClose={() => !holdBusy && setHoldDialogOpen(false)}
        title={`Apply a hold to ${productName}?`}
        busy={holdBusy}
        footer={(
          <>
            <button type="button" onClick={() => setHoldDialogOpen(false)} disabled={holdBusy} className="h-10 rounded-lg border border-[#ddd6cd] px-4 text-[12.5px] font-semibold hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">Cancel</button>
            <button type="button" onClick={applyHold} disabled={holdBusy || !holdReason.trim()} className="h-10 rounded-lg bg-[#51473f] px-4 text-[12.5px] font-semibold text-white hover:bg-[#3a332c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51473f]/30 disabled:opacity-50">{holdBusy ? "Applying…" : "Apply hold"}</button>
          </>
        )}
      >
        <p className="text-[13px] leading-6 text-[#75685f]">A legal or administrative hold prevents permanent deletion and restoration until an authorized admin releases it.</p>
        <label className="mt-4 block text-[12px] font-semibold">Reason (required)
          <textarea value={holdReason} onChange={(event) => setHoldReason(event.target.value)} rows={2} autoComplete="off" placeholder="Reason for this hold…" className="mt-1.5 w-full rounded-lg border border-[#ddd6cd] p-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25" />
        </label>
        {holdError ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-[12px] leading-5 text-red-700">{holdError}</p> : null}
      </ProductActionDialog>

      <ProductActionDialog
        open={confirming}
        onClose={() => !busy && setConfirming(false)}
        title={`Permanently delete ${productName}?`}
        busy={busy}
        footer={(
          <>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-10 rounded-lg border border-[#ddd6cd] px-4 text-[12.5px] font-semibold hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">Cancel</button>
            <button type="button" onClick={permanentlyDelete} disabled={busy || confirmText !== productName} className="h-10 rounded-lg bg-red-700 px-4 text-[12.5px] font-semibold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-50">{busy ? "Deleting…" : "Delete permanently"}</button>
          </>
        )}
      >
        <p className="text-[13px] leading-6 text-[#75685f]">The latest database check found no permanent history and no current blockers. This action is immediate and cannot be undone.</p>
        <label className="mt-4 block text-[12px] font-semibold">Reason (optional)<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} autoComplete="off" className="mt-1.5 w-full rounded-lg border border-[#ddd6cd] p-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25" /></label>
        <label className="mt-4 block text-[12px] font-semibold">Type <strong>{productName}</strong> to confirm<input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" className="mt-1.5 h-11 w-full rounded-lg border border-[#ddd6cd] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25" /></label>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-[12px] leading-5 text-red-700">{error}</p>}
      </ProductActionDialog>

      <ProductActionDialog
        open={restoring}
        onClose={() => !restoreBusy && setRestoring(false)}
        title={`Restore ${productName}?`}
        busy={restoreBusy}
        footer={(
          <>
            <button type="button" onClick={() => setRestoring(false)} disabled={restoreBusy} className="h-10 rounded-lg border border-[#ddd6cd] px-4 text-[12.5px] font-semibold hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">Cancel</button>
            <button type="button" onClick={confirmRestore} disabled={restoreBusy || !restoreReason.trim()} className="h-10 rounded-lg bg-[#51473f] px-4 text-[12.5px] font-semibold text-white hover:bg-[#3a332c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51473f]/30 disabled:opacity-50">{restoreBusy ? "Restoring…" : "Restore to Paused"}</button>
          </>
        )}
      >
        <p className="text-[13px] leading-6 text-[#75685f]">
          This re-checks the active brand, administrative holds, and fulfillment transitions before restoring. It lands as
          <strong> Paused</strong>, not Published, so missing product information or variants can be repaired safely before Resume performs the full publish-readiness check.
        </p>
        <label className="mt-4 block text-[12px] font-semibold">Reason (required)
          <textarea value={restoreReason} onChange={(event) => setRestoreReason(event.target.value)} rows={2} autoComplete="off" placeholder="Why this product is being restored…" className="mt-1.5 w-full rounded-lg border border-[#ddd6cd] p-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25" />
        </label>
        {restoreError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-[12px] leading-5 text-red-700">{restoreError}</p>}
      </ProductActionDialog>
    </div>
  );
}

function ArchivedBlockerGroup({
  title,
  blockers,
  audience,
  productId,
  brandParam,
}: {
  title?: string;
  blockers: DeletionBlocker[];
  audience: "admin" | "brand";
  productId: string;
  brandParam: string;
}) {
  return (
    <div className="space-y-2">
      {title ? <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#8a7d73]">{title}</p> : null}
      {blockers.map((blocker) => {
        const destination = audience === "admin"
          ? getAdminDeletionBlockerDestination(blocker, productId)
          : getBrandDeletionBlockerDestination(blocker, brandParam);
        const notice = audience === "brand" ? getBrandDeletionBlockerNotice(blocker) : null;
        return (
          <div key={blocker.code} className="flex gap-2 text-[11.5px] leading-5 text-[#51473f]">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-none text-[#C85956]" aria-hidden="true" />
            <div>
              <p className="font-semibold">{blocker.message}</p>
              <p className="text-[#75685f]">{blocker.resolution}</p>
              {destination ? (
                <Link href={destination.href} className="rounded font-semibold text-[#C85956] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">
                  {destination.label}
                </Link>
              ) : null}
              {notice ? <p className="mt-1 font-semibold text-[#75685f]">{notice}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
