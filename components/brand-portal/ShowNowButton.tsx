"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2 } from "lucide-react";

// The authorized override for a when_stocked product still waiting on its
// first stock — expose it out of stock before stock arrives. Owner-only
// (server-side re-verified); calls the canonical set_product_launch_policy_
// show_now RPC via its API route, never a raw status/launch_policy PATCH.
export default function ShowNowButton({ productId, brandParam }: { productId: string; brandParam: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    if (busy) return;
    if (!window.confirm("Show this product to customers now, even though it has no stock yet?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/brand-portal/products/${productId}/show-now${brandParam}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dcd3ca] bg-white px-2.5 text-[11px] font-bold text-[#51473f] transition-colors hover:border-mahalyred/45 hover:text-mahalyred disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
        Show now
      </button>
      {error && <p className="mt-1 text-[10.5px] text-red-700">{error}</p>}
    </div>
  );
}
