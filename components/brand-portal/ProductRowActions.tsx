"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Archive, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";

type PendingAction = "archive" | "delete" | null;

export default function ProductRowActions({
  productId,
  name,
  editHref,
  canArchive,
  deletionRequested,
}: {
  productId: string;
  name: string;
  editHref: string;
  canArchive: boolean;
  deletionRequested: boolean;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);

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
      const response = await fetch(`/api/brand-portal/products/${productId}`, pendingAction === "archive"
        ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive" }) }
        : { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? (pendingAction === "archive" ? "We couldn't archive this product." : "We couldn't request deletion."));
        return;
      }
      setPendingAction(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const chooseAction = (action: Exclude<PendingAction, null>) => {
    if (menuRef.current) menuRef.current.open = false;
    setPendingAction(action);
  };

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Link href={editHref} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#ddd6cd] bg-white px-3 text-[12px] font-semibold text-[#51473f] transition-colors hover:bg-[#f7f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
        </Link>
        <details ref={menuRef} className="group relative">
          <summary aria-label={`More actions for ${name}`} className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-[#ddd6cd] bg-white text-[#75685f] transition-colors hover:bg-[#f7f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 [&::-webkit-details-marker]:hidden">
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </summary>
          <div className="absolute right-0 top-11 z-20 w-52 rounded-xl border border-[#ddd6cd] bg-white p-1.5 shadow-[0_16px_40px_rgba(67,45,29,0.14)]">
            {canArchive && <button type="button" onClick={() => chooseAction("archive")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12.5px] font-medium text-[#51473f] hover:bg-[#f7f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"><Archive className="h-4 w-4" aria-hidden="true" />Archive product</button>}
            {deletionRequested
              ? <p className="px-3 py-2.5 text-[12px] text-[#9b8e84]">Deletion requested</p>
              : <button type="button" onClick={() => chooseAction("delete")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12.5px] font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"><Trash2 className="h-4 w-4" aria-hidden="true" />Request deletion</button>}
          </div>
        </details>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="product-action-title" aria-describedby="product-action-description">
          <button type="button" className="absolute inset-0 bg-[#242424]/35 backdrop-blur-[2px]" aria-label="Close confirmation" onClick={() => !busy && setPendingAction(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-[#e3dcd3] bg-[#fffdf9] p-6 shadow-[0_24px_70px_rgba(36,36,36,0.22)]">
            <button type="button" onClick={() => setPendingAction(null)} disabled={busy} aria-label="Close confirmation" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-[#81746a] hover:bg-[#f1eae2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 disabled:opacity-50"><X className="h-4 w-4" aria-hidden="true" /></button>
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${pendingAction === "archive" ? "bg-[#f1eae2] text-[#75685f]" : "bg-red-50 text-red-700"}`}>
              {pendingAction === "archive" ? <Archive className="h-5 w-5" aria-hidden="true" /> : <Trash2 className="h-5 w-5" aria-hidden="true" />}
            </div>
            <h2 id="product-action-title" className="mt-4 pr-9 text-xl font-bold tracking-[-0.025em] text-[#242424]">{pendingAction === "archive" ? `Archive ${name}?` : `Request deletion of ${name}?`}</h2>
            <p id="product-action-description" className="mt-2 text-[13px] leading-6 text-[#75685f]">{pendingAction === "archive" ? "The product will leave the storefront immediately. You can find it later by filtering for Archived products." : "Zakhnook staff will review the request before permanently removing the product."}</p>
            {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">{error} Please try again.</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button ref={cancelRef} type="button" onClick={() => setPendingAction(null)} disabled={busy} className="h-10 rounded-xl border border-[#ddd6cd] bg-white px-4 text-[12.5px] font-semibold text-[#51473f] hover:bg-[#f7f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={confirmAction} disabled={busy} className={`h-10 rounded-xl px-4 text-[12.5px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60 ${pendingAction === "archive" ? "bg-[#332c27] hover:bg-[#4a4039] focus-visible:ring-[#332c27]/25" : "bg-red-700 hover:bg-red-800 focus-visible:ring-red-300"}`}>{busy ? "Working…" : pendingAction === "archive" ? "Archive product" : "Send request"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
