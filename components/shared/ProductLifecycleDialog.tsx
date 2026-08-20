"use client";

import Link from "next/link";
import { AlertTriangle, Archive, Loader2, RefreshCcw, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DeletionBlocker, ProductDeletionEligibility } from "@/lib/admin/productDeletion";
import ProductActionDialog from "@/components/products/ProductActionDialog";

// Shared "Delete permanently" dialog for a Published/Paused product,
// used identically by the Admin Dashboard and Brand Portal (only the
// endpoint base path and copy-level permission differ) — see the
// product-deletion-delete-first spec: Archive is no longer an ordinary
// menu action, it is only ever offered here as the fallback when
// permanent deletion is impossible because of immutable business history.
//
// Every number shown comes from a real server-side preflight
// (private.compute_product_deletion_eligibility) run fresh when the dialog
// opens and again inside the locked deletion/archive transaction itself —
// nothing here is a client-side assumption.

type Phase = "loading" | "error" | "result" | "confirm-delete" | "confirm-archive" | "success";

export interface ProductLifecycleDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (outcome: "deleted" | "archived") => void;
  productId: string;
  productName: string;
  // e.g. `/api/brand-portal/products/${id}/deletion?brand=slug` or
  // `/api/admin/products/${id}/deletion` — GET fetches eligibility, POST
  // performs the confirmed action.
  apiPath: string;
  // False for a Brand Assistant: they can see why a product can't be
  // deleted, but only an Owner/Admin may actually confirm the destructive
  // action. Archive is still offered to an Assistant per existing policy.
  canDeletePermanently: boolean;
  resolveBlockerHref: (blocker: DeletionBlocker) => string | null;
  // Shown once, above the archive-confirmation copy, so an Assistant sees
  // why they can't finish the delete path themselves.
  restrictedDeleteMessage?: string;
}

function BlockerList({
  title,
  blockers,
  tone,
  resolveHref,
}: {
  title: string;
  blockers: DeletionBlocker[];
  tone: "immutable" | "temporary";
  resolveHref: (blocker: DeletionBlocker) => string | null;
}) {
  if (blockers.length === 0) return null;
  const toneClass = tone === "immutable" ? "border-[#eadfd8] bg-[#fffaf7]" : "border-amber-200 bg-amber-50";
  const iconClass = tone === "immutable" ? "text-[#C85956]" : "text-amber-600";
  return (
    <div className={`mt-3 rounded-xl border p-3 ${toneClass}`}>
      <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#6f6259]">{title}</p>
      <ul className="mt-2 space-y-2.5">
        {blockers.map((blocker) => {
          const href = resolveHref(blocker);
          const quantityLabel =
            blocker.quantity != null ? ` (${blocker.quantity})` : blocker.count != null ? ` (${blocker.count})` : "";
          return (
            <li key={blocker.code} className="flex gap-2 text-[12.5px] leading-5">
              {tone === "immutable" ? (
                <ShieldAlert className={`mt-0.5 h-4 w-4 flex-none ${iconClass}`} aria-hidden="true" />
              ) : (
                <AlertTriangle className={`mt-0.5 h-4 w-4 flex-none ${iconClass}`} aria-hidden="true" />
              )}
              <div>
                <p className="font-semibold text-[#3a332c]">
                  {blocker.message}
                  {quantityLabel}
                </p>
                <p className="text-[#75685f]">{blocker.resolution}</p>
                {href && (
                  <Link href={href} className="rounded font-semibold text-[#C85956] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">
                    Open related area
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ProductLifecycleDialog({
  open,
  onClose,
  onSuccess,
  productId,
  productName,
  apiPath,
  canDeletePermanently,
  resolveBlockerHref,
  restrictedDeleteMessage = "Only the brand owner or an authorized admin can permanently delete a product.",
}: ProductLifecycleDialogProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [eligibility, setEligibility] = useState<ProductDeletionEligibility | null>(null);
  const [error, setError] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [successOutcome, setSuccessOutcome] = useState<"deleted" | "archived" | null>(null);
  const operationKeyRef = useRef("");
  const firstFieldRef = useRef<HTMLInputElement>(null);

  async function loadEligibility() {
    setPhase("loading");
    setError("");
    try {
      const response = await fetch(apiPath, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "The deletion check could not be completed.");
        setPhase("error");
        return;
      }
      setEligibility(data.eligibility as ProductDeletionEligibility);
      setPhase("result");
    } catch {
      setError("The deletion check could not be completed. Check your connection and try again.");
      setPhase("error");
    }
  }

  useEffect(() => {
    if (!open) return;
    // Resetting local form state when the dialog opens for a (possibly
    // different) product is a deliberate sync-on-prop-change, not derived
    // render state — same convention as DashboardShell's collapsed-state
    // effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmText("");
    setReason("");
    setError("");
    setSuccessOutcome(null);
    void loadEligibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productId]);

  useEffect(() => {
    if (phase === "confirm-delete") firstFieldRef.current?.focus();
  }, [phase]);

  if (!open) return null;

  function beginDelete() {
    operationKeyRef.current = crypto.randomUUID();
    setConfirmText("");
    setReason("");
    setError("");
    setPhase("confirm-delete");
  }

  function beginArchive() {
    operationKeyRef.current = "";
    setReason("");
    setError("");
    setPhase("confirm-archive");
  }

  async function submitDelete() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_live",
          reason,
          operationKey: operationKeyRef.current,
          confirmationName: confirmText,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        // A time-of-check/time-of-use change (something happened between
        // opening the dialog and confirming) is re-surfaced as a fresh
        // preflight result rather than a bare error.
        if (Array.isArray(data.blockers) && data.blockers.length > 0) {
          setEligibility((current) => {
            if (!current) return current;
            const nextBlockers = data.blockers as DeletionBlocker[];
            const immutableReasons = nextBlockers.filter((blocker) => blocker.kind === "immutable");
            const temporaryBlockers = nextBlockers.filter((blocker) => blocker.kind === "temporary");
            return {
              ...current,
              blockers: nextBlockers,
              immutableReasons,
              temporaryBlockers,
              mustRetainHistory: immutableReasons.length > 0,
              hasTemporaryBlockers: temporaryBlockers.length > 0,
              canArchive: immutableReasons.length > 0 && temporaryBlockers.length === 0,
              canDeleteLive: false,
            };
          });
          setError("This product changed since the check ran. Review the current blockers below.");
          setPhase("result");
          return;
        }
        setError(data.error ?? "This product could not be deleted.");
        return;
      }
      setSuccessOutcome("deleted");
      setPhase("success");
      onSuccess("deleted");
    } catch {
      setError("The request failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitArchive() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        if (Array.isArray(data.blockers) && data.blockers.length > 0) {
          await loadEligibility();
          setError("This product changed since the check ran. Review the current blockers below.");
          return;
        }
        setError(data.error ?? "This product could not be archived.");
        return;
      }
      setSuccessOutcome("archived");
      setPhase("success");
      onSuccess("archived");
    } catch {
      setError("The request failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const immutable = eligibility?.immutableReasons ?? [];
  const temporary = eligibility?.temporaryBlockers ?? [];
  const canDeleteLive = Boolean(eligibility?.canDeleteLive);
  const canArchive = Boolean(eligibility?.canArchive);
  const hasTemporaryBlockers = temporary.length > 0;
  const title = phase === "confirm-delete"
    ? `Permanently delete ${productName}?`
    : phase === "confirm-archive"
      ? `Archive ${productName}?`
      : phase === "success"
        ? successOutcome === "deleted" ? "Deleted permanently" : "Archived"
        : canDeletePermanently ? `Delete ${productName} permanently` : `Remove ${productName} from the catalog`;

  return (
    <ProductActionDialog open={open} onClose={onClose} title={title} busy={busy}>

        {/* Always-visible framing copy, shown before and alongside the
            preflight result — required so the dialog never depends solely
            on the check having already run to explain itself. */}
        {(phase === "loading" || phase === "error" || phase === "result") && (
          <div className="mt-2 space-y-1.5 text-[12.5px] leading-5 text-[#75685f]">
            <p>Permanent deletion cannot be undone.</p>
            <p>The system inspects this product before allowing deletion.</p>
            <p>Products with permanent business history cannot be deleted — they can be Archived instead.</p>
            <p>
              Archived products are hidden from customers and keep their records. {" "}
              {canDeletePermanently
                ? "You cannot restore an Archived product yourself; an admin must do that."
                : "Only an admin can restore an Archived product."}
            </p>
          </div>
        )}

        {phase === "loading" && (
          <p className="mt-4 flex items-center gap-2 text-[13px] text-[#75685f]" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Checking this product&apos;s history and stock…
          </p>
        )}

        {phase === "error" && (
          <div className="mt-4">
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-[12.5px] text-red-700">
              {error}
            </p>
            <button
              type="button"
              onClick={loadEligibility}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#ddd6cd] px-3 py-2 text-[12.5px] font-semibold text-[#51473f] hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
            </button>
          </div>
        )}

        {phase === "result" && eligibility && (
          <div className="mt-3" aria-live="polite">
            {canDeleteLive && (
              <p className="rounded-lg bg-emerald-50 p-3 text-[12.5px] font-semibold text-emerald-800">
                No permanent history or blockers found. This product can be permanently deleted.
              </p>
            )}

            <BlockerList title="Permanent business history" blockers={immutable} tone="immutable" resolveHref={resolveBlockerHref} />
            <BlockerList title="Temporary blockers" blockers={temporary} tone="temporary" resolveHref={resolveBlockerHref} />

            {error && (
              <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-[12.5px] text-red-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {hasTemporaryBlockers && (
                <button
                  type="button"
                  onClick={loadEligibility}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#ddd6cd] px-4 text-[12.5px] font-semibold text-[#51473f] hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"
                >
                  <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> Re-check
                </button>
              )}
              <button type="button" onClick={onClose} className="h-10 rounded-lg border border-[#ddd6cd] px-4 text-[12.5px] font-semibold text-[#51473f] hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">
                Cancel
              </button>
              {canArchive && (
                <button
                  type="button"
                  onClick={beginArchive}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#51473f] px-4 text-[12.5px] font-semibold text-white hover:bg-[#3a332c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51473f]/30"
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archive product
                </button>
              )}
              {canDeleteLive && (
                <button
                  type="button"
                  disabled={!canDeletePermanently}
                  onClick={beginDelete}
                  title={canDeletePermanently ? undefined : restrictedDeleteMessage}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#C85956] px-4 text-[12.5px] font-semibold text-white hover:bg-[#b34845] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete permanently
                </button>
              )}
            </div>
            {canDeleteLive && !canDeletePermanently && (
              <p className="mt-2 text-right text-[11.5px] text-[#8a7d73]">{restrictedDeleteMessage}</p>
            )}
          </div>
        )}

        {phase === "confirm-delete" && (
          <div className="mt-3">
            <p className="text-[13px] leading-6 text-[#75685f]">
              This cannot be undone. {productName} and its disposable catalog data will be permanently removed right now — there
              is no approval step, waiting period, or scheduled deletion.
            </p>
            <label className="mt-4 block text-[12px] font-semibold text-[#51473f]">
              Reason (optional)
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                autoComplete="off"
                className="mt-1.5 w-full rounded-lg border border-[#ddd6cd] p-2.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"
              />
            </label>
            <label className="mt-4 block text-[12px] font-semibold text-[#51473f]">
              Type <strong>{productName}</strong> to confirm
              <input
                ref={firstFieldRef}
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                autoComplete="off"
                aria-label={`Type ${productName} to confirm permanent deletion`}
                className="mt-1.5 w-full rounded-lg border border-[#ddd6cd] p-2.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"
              />
            </label>
            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-[12.5px] text-red-700">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPhase("result")}
                disabled={busy}
                className="h-10 rounded-lg border border-[#ddd6cd] px-4 text-[12.5px] font-semibold text-[#51473f] hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"
              >
                Back
              </button>
              <button
                type="button"
                onClick={submitDelete}
                disabled={busy || confirmText !== productName}
                className="h-10 rounded-lg bg-[#C85956] px-4 text-[12.5px] font-semibold text-white hover:bg-[#b34845] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        )}

        {phase === "confirm-archive" && (
          <div className="mt-3">
            <p className="text-[13px] leading-6 text-[#75685f]">
              {productName} has permanent business history, so it must be Archived rather than deleted. Archiving hides it from
              every customer-facing and purchasing surface immediately and keeps all of its records — nothing is deleted.{" "}
              {canDeletePermanently
                ? "You will not be able to restore it yourself afterward; an admin will need to do that."
                : "Only an admin will be able to restore it afterward."}
            </p>
            <label className="mt-4 block text-[12px] font-semibold text-[#51473f]">
              Reason (optional)
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                autoComplete="off"
                className="mt-1.5 w-full rounded-lg border border-[#ddd6cd] p-2.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"
              />
            </label>
            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-[12.5px] text-red-700">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPhase("result")}
                disabled={busy}
                className="h-10 rounded-lg border border-[#ddd6cd] px-4 text-[12.5px] font-semibold text-[#51473f] hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"
              >
                Back
              </button>
              <button
                type="button"
                onClick={submitArchive}
                disabled={busy}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#51473f] px-4 text-[12.5px] font-semibold text-white hover:bg-[#3a332c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51473f]/30 disabled:opacity-50"
              >
                {busy ? "Archiving…" : "Yes, archive it"}
              </button>
            </div>
          </div>
        )}

        {phase === "success" && (
          <div className="mt-3">
            <p className="rounded-lg bg-emerald-50 p-3 text-[13px] leading-6 text-emerald-800">
              {successOutcome === "deleted"
                ? `${productName} was permanently deleted.`
                : `${productName} was Archived. It is hidden from customers and its records are preserved.`}
            </p>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={onClose} className="h-10 rounded-lg bg-[#51473f] px-4 text-[12.5px] font-semibold text-white hover:bg-[#3a332c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51473f]/30">
                Done
              </button>
            </div>
          </div>
        )}
    </ProductActionDialog>
  );
}
