"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const NEXT_STATUS: Record<string, { target: string; label: string }> = {
  paid: { target: "preparing", label: "Mark as Preparing" },
  preparing: { target: "shipped", label: "Mark as Shipped" },
};

export default function BrandOrderStatusControl({
  orderId,
  status,
  brandSlug,
}: {
  orderId: string;
  status: string;
  brandSlug: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const next = NEXT_STATUS[status];
  if (!next) return null;

  const handleClick = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/brand-portal/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next.target, brandSlug }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to update status");
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to update status");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="rounded-full border border-[#302b27]/15 bg-white px-3 py-1.5 text-[10.5px] font-bold text-[#302b27] transition-colors hover:bg-[#302b27]/5 disabled:opacity-60"
      >
        {submitting ? "…" : next.label}
      </button>
      {error && <span className="text-[10.5px] text-red-600">{error}</span>}
    </div>
  );
}
