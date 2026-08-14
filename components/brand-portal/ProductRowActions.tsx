"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Archive, MoreHorizontal, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ProductDeletionEligibility } from "@/lib/admin/productDeletion";

type PendingAction = "archive" | "restore" | "delete_draft" | "request" | "cancel" | null;

interface ActiveRequest {
  status: string;
  adminNote: string | null;
}

// Deliberately calls each action by what it actually does — "archive"
// never says "delete," and "delete_draft"/"request" are never conflated,
// per the product deletion lifecycle redesign (supabase/migrations/
// 20260814020000_product_deletion_lifecycle.sql). Eligibility is fetched
// lazily when the menu opens (GET .../deletion) rather than eagerly for
// every row in the list — the database, not this component, decides what's
// actually allowed; every confirm button below just reflects that answer.
export default function ProductRowActions({
  productId,
  name,
  editHref,
}: {
  productId: string;
  name: string;
  editHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [eligibility, setEligibility] = useState<ProductDeletionEligibility | null>(null);
  const [activeRequest, setActiveRequest] = useState<ActiveRequest | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  // Generated once when the "request permanent deletion" dialog opens and
  // reused for every retry of that same attempt (a network error + resend
  // must not mint a fresh key each time, or the server-side idempotency
  // check in request_product_deletion never actually gets exercised) — a
  // fresh dialog open (chooseAction) always gets a fresh key, since that's
  // a genuinely new attempt, not a retry.
  const requestIdempotencyKeyRef = useRef<string>("");

  const loadState = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/brand-portal/products/${productId}/deletion`);
      if (!res.ok) return;
      const data = await res.json();
      setEligibility(data.eligibility);
      setActiveRequest(data.activeRequest ? { status: data.activeRequest.status, adminNote: data.activeRequest.adminNote } : null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!pendingAction) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setPendingAction(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, pendingAction]);

  const confirmAction = async () => {
    if (!pendingAction) return;
    setBusy(true);
    setError("");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (pendingAction === "request") {
        headers["Idempotency-Key"] = requestIdempotencyKeyRef.current;
      }
      const response = await fetch(`/api/brand-portal/products/${productId}/deletion`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: pendingAction, reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "That didn't work — please try again.");
        return;
      }
      setPendingAction(null);
      setReason("");
      setConfirmText("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const chooseAction = (action: Exclude<PendingAction, null>) => {
    if (menuRef.current) menuRef.current.open = false;
    setError("");
    setReason("");
    setConfirmText("");
    if (action === "request") {
      requestIdempotencyKeyRef.current = crypto.randomUUID();
    }
    setPendingAction(action);
  };

  const needsTypedConfirm = pendingAction === "delete_draft";
  const canConfirm = !busy && (!needsTypedConfirm || confirmText.trim().toLowerCase() === name.trim().toLowerCase());

  const dialogCopy: Record<Exclude<PendingAction, null>, { title: string; body: string; confirmLabel: string; tone: "neutral" | "danger" }> = {
    archive: {
      title: `Archive ${name}?`,
      body: "The product leaves the storefront immediately — customers can no longer find or buy it. Nothing is deleted: orders, reviews, and inventory history stay exactly as they are, and you can restore it later from the Archived filter.",
      confirmLabel: "Archive product",
      tone: "neutral",
    },
    restore: {
      title: `Restore ${name}?`,
      body: "The product becomes available on the storefront again, once it still meets today's publishing requirements (active variants, an active brand).",
      confirmLabel: "Restore product",
      tone: "neutral",
    },
    delete_draft: {
      title: `Permanently delete ${name}?`,
      body: "This draft has never been published or stocked, so it can be deleted immediately without staff review. This cannot be undone — the product and its draft data will be gone for good. Type the product name below to confirm.",
      confirmLabel: "Delete permanently",
      tone: "danger",
    },
    request: {
      title: `Request permanent deletion of ${name}?`,
      body: "This sends a request to Zakhnook staff to permanently delete this archived product. It stays archived (hidden from the storefront) either way — if staff find open orders, stock, or warehouse activity still in progress when they review it, the request is blocked (not rejected) until that clears; if new order, review, inventory, or warehouse history appears before then, it will remain archived permanently instead.",
      confirmLabel: "Send request",
      tone: "danger",
    },
    cancel: {
      title: "Cancel this deletion request?",
      body: "The product stays archived. You can request permanent deletion again later.",
      confirmLabel: "Cancel request",
      tone: "neutral",
    },
  };

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Link href={editHref} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#ddd6cd] bg-white px-3 text-[12px] font-semibold text-[#51473f] transition-colors hover:bg-[#f7f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
        </Link>
        <details ref={menuRef} className="group relative" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) loadState(); }}>
          <summary aria-label={`More actions for ${name}`} className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-[#ddd6cd] bg-white text-[#75685f] transition-colors hover:bg-[#f7f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 [&::-webkit-details-marker]:hidden">
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </summary>
          <div className="absolute right-0 top-11 z-20 w-64 rounded-xl border border-[#ddd6cd] bg-white p-1.5 shadow-[0_16px_40px_rgba(67,45,29,0.14)]">
            {loading && <p className="px-3 py-2.5 text-[12px] text-[#9b8e84]">Loading…</p>}
            {!loading && eligibility && (
              <>
                {eligibility.canArchive && (
                  <button type="button" onClick={() => chooseAction("archive")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12.5px] font-medium text-[#51473f] hover:bg-[#f7f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">
                    <Archive className="h-4 w-4" aria-hidden="true" />Archive product
                  </button>
                )}
                {eligibility.canRestore && (
                  <button type="button" onClick={() => chooseAction("restore")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12.5px] font-medium text-[#51473f] hover:bg-[#f7f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />Restore product
                  </button>
                )}
                {eligibility.canDeleteImmediately && (
                  <button type="button" onClick={() => chooseAction("delete_draft")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12.5px] font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />Delete draft
                  </button>
                )}
                {activeRequest ? (
                  <div className="px-3 py-2.5 text-[12px] text-[#9b8e84]">
                    <p className="font-semibold text-[#51473f]">
                      Deletion request: {activeRequest.status === "blocked" ? "blocked by staff" : activeRequest.status.replace("_", " ")}
                    </p>
                    {activeRequest.adminNote && <p className="mt-1">{activeRequest.adminNote}</p>}
                    <button type="button" onClick={() => chooseAction("cancel")} className="mt-1.5 font-semibold text-red-700 hover:underline">
                      Cancel request
                    </button>
                  </div>
                ) : eligibility.canRequestDeletion ? (
                  <button type="button" onClick={() => chooseAction("request")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12.5px] font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />Request permanent deletion
                  </button>
                ) : eligibility.mustRetainHistory ? (
                  <p className="px-3 py-2.5 text-[12px] leading-5 text-[#9b8e84]">
                    This product has order, inventory, or warehouse history and will remain archived permanently — it can never be deleted.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </details>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="product-action-title" aria-describedby="product-action-description">
          <button type="button" className="absolute inset-0 bg-[#242424]/35 backdrop-blur-[2px]" aria-label="Close confirmation" onClick={() => !busy && setPendingAction(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-[#e3dcd3] bg-[#fffdf9] p-6 shadow-[0_24px_70px_rgba(36,36,36,0.22)]">
            <button type="button" onClick={() => setPendingAction(null)} disabled={busy} aria-label="Close confirmation" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-[#81746a] hover:bg-[#f1eae2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 disabled:opacity-50"><X className="h-4 w-4" aria-hidden="true" /></button>
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${dialogCopy[pendingAction].tone === "danger" ? "bg-red-50 text-red-700" : "bg-[#f1eae2] text-[#75685f]"}`}>
              {dialogCopy[pendingAction].tone === "danger" ? <Trash2 className="h-5 w-5" aria-hidden="true" /> : <Archive className="h-5 w-5" aria-hidden="true" />}
            </div>
            <h2 id="product-action-title" className="mt-4 pr-9 text-xl font-bold tracking-[-0.025em] text-[#242424]">{dialogCopy[pendingAction].title}</h2>
            <p id="product-action-description" className="mt-2 text-[13px] leading-6 text-[#75685f]">{dialogCopy[pendingAction].body}</p>

            {pendingAction === "request" && (
              <label className="mt-4 block text-[12px] font-semibold text-[#51473f]">
                Reason (optional)
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="mt-1.5 w-full rounded-xl border border-[#ddd6cd] bg-white p-2.5 text-[12.5px] text-[#242424] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"
                />
              </label>
            )}

            {needsTypedConfirm && (
              <label className="mt-4 block text-[12px] font-semibold text-[#51473f]">
                Type <span className="font-bold">{name}</span> to confirm
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#ddd6cd] bg-white p-2.5 text-[12.5px] text-[#242424] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                  autoComplete="off"
                />
              </label>
            )}

            {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button ref={cancelRef} type="button" onClick={() => setPendingAction(null)} disabled={busy} className="h-10 rounded-xl border border-[#ddd6cd] bg-white px-4 text-[12.5px] font-semibold text-[#51473f] hover:bg-[#f7f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 disabled:opacity-50">Cancel</button>
              <button
                type="button"
                onClick={confirmAction}
                disabled={!canConfirm}
                className={`h-10 rounded-xl px-4 text-[12.5px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60 ${dialogCopy[pendingAction].tone === "danger" ? "bg-red-700 hover:bg-red-800 focus-visible:ring-red-300" : "bg-[#332c27] hover:bg-[#4a4039] focus-visible:ring-[#332c27]/25"}`}
              >
                {busy ? "Working…" : dialogCopy[pendingAction].confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
