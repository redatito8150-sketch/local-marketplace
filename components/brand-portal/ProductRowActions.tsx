"use client";

import Link from "next/link";
import { Archive, MoreHorizontal, Pause, Pencil, Play, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ProductDeletionEligibility } from "@/lib/admin/productDeletion";

type PendingAction = "archive" | "delete_draft" | "delete_archived" | null;

export default function ProductRowActions({ productId, name, editHref }: { productId: string; name: string; editHref: string }) {
  const router = useRouter();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const operationKeyRef = useRef("");
  const [eligibility, setEligibility] = useState<ProductDeletionEligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadEligibility() {
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
    if (!eligibility) return;
    setLoading(true);
    try {
      const query = editHref.includes("?") ? editHref.slice(editHref.indexOf("?")) : "";
      const response = await fetch(`/api/brand-portal/products/${productId}${query}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle-pause", pausedByBrand: eligibility.lifecycle !== "paused" }),
      });
      if (response.ok) {
        menuRef.current?.removeAttribute("open");
        setEligibility({ ...eligibility, lifecycle: eligibility.lifecycle === "paused" ? "published" : "paused" });
        router.refresh();
      }
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
    menuRef.current?.removeAttribute("open");
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

  // Native <details> only closes on its own summary being clicked again —
  // it does not close on an outside click by itself. Closes on any
  // pointerdown outside the menu (mousedown, not click, so it fires before
  // a click on another row's own trigger opens THAT one — no flicker of
  // both being briefly open) and on Escape, matching ordinary dropdown/menu
  // behavior elsewhere in the app.
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const menu = menuRef.current;
      if (!menu?.open) return;
      if (event.target instanceof Node && !menu.contains(event.target)) {
        menu.removeAttribute("open");
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") menuRef.current?.removeAttribute("open");
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <>
      <details ref={menuRef} className="relative" onToggle={(event) => event.currentTarget.open && !eligibility && loadEligibility()}>
        <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-[#75685f] hover:bg-[#f1eae2]" aria-label={`Actions for ${name}`}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </summary>
        <div className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-[#e3dcd3] bg-white p-1.5 shadow-xl">
          <Link href={editHref} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[12.5px] font-medium text-[#51473f] hover:bg-[#f7f0e8]">
            <Pencil className="h-4 w-4" aria-hidden="true" /> Edit product
          </Link>
          {loading && <p className="px-3 py-2 text-[11.5px] text-[#8a7d73]">Checking product…</p>}
          {(eligibility?.lifecycle === "published" || eligibility?.lifecycle === "paused") && (
            <button type="button" onClick={togglePause} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12.5px] font-medium text-[#51473f] hover:bg-[#f7f0e8]">
              {eligibility.lifecycle === "paused" ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
              {eligibility.lifecycle === "paused" ? "Resume" : "Pause temporarily"}
            </button>
          )}
          {eligibility?.canArchive && (
            <button type="button" onClick={() => open("archive")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12.5px] font-medium text-[#51473f] hover:bg-[#f7f0e8]">
              <Archive className="h-4 w-4" aria-hidden="true" /> Archive
            </button>
          )}
          {eligibility?.canDeleteDraft && (
            <button type="button" onClick={() => open("delete_draft")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12.5px] font-medium text-red-700 hover:bg-red-50">
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete pristine Draft
            </button>
          )}
        </div>
      </details>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="product-action-title">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={() => !busy && setPendingAction(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-[#e3dcd3] bg-white p-6 shadow-xl">
            <button type="button" onClick={() => setPendingAction(null)} className="absolute right-4 top-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
            <h2 id="product-action-title" className="pr-10 text-lg font-bold text-[#242424]">
              {pendingAction === "archive" ? `Archive ${name}?` : `Permanently delete ${name}?`}
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-[#75685f]">
              {pendingAction === "archive"
                ? "This hides the product immediately. Archived is final; it cannot be resumed or restored."
                : "This cannot be undone. The product and its disposable catalog data will be permanently removed."}
            </p>
            {isDelete && (
              <>
                <label className="mt-4 block text-[12px] font-semibold text-[#51473f]">Reason (optional)
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="mt-1.5 w-full rounded-lg border border-[#ddd6cd] p-2.5" />
                </label>
                <label className="mt-4 block text-[12px] font-semibold text-[#51473f]">Type <strong>{name}</strong> to confirm
                  <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" className="mt-1.5 w-full rounded-lg border border-[#ddd6cd] p-2.5" />
                </label>
              </>
            )}
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-[12px] leading-5 text-red-700">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingAction(null)} disabled={busy} className="h-10 rounded-lg border border-[#ddd6cd] px-4 text-[12.5px] font-semibold">Cancel</button>
              <button type="button" onClick={confirm} disabled={!canConfirm} className="h-10 rounded-lg bg-[#C85956] px-4 text-[12.5px] font-semibold text-white disabled:opacity-50">
                {busy ? "Working…" : pendingAction === "archive" ? "Archive" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
