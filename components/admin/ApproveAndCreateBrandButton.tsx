"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// One-click brand creation from an approved application: no form, no
// image upload from the admin — the server derives a slug/SKU prefix and
// fills in placeholder content, creates the brand unpublished
// (is_active: false), and links it to the applicant's account. The brand
// owner completes their own page from /brand-portal/brand-content once
// they sign in — this button's only job is to confirm the application
// data looks right and hand off ownership.
export default function ApproveAndCreateBrandButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "creating" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (
      !window.confirm(
        "Create this brand now? It will be linked to the applicant's account and start unpublished — they'll finish their own page from the brand portal."
      )
    ) {
      return;
    }
    setStatus("creating");
    setError(null);
    try {
      const res = await fetch(`/api/admin/applications/${applicationId}/create-brand`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to create brand");
        setStatus("error");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("error");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "creating"}
        className="rounded-md bg-mahalyred px-3.5 py-2 text-[12.5px] font-bold text-white hover:bg-mahalyred/90 disabled:opacity-60"
      >
        {status === "creating" ? "Creating…" : "Create brand"}
      </button>
      {error && <p className="max-w-[240px] text-right text-[11.5px] text-red-600">{error}</p>}
    </div>
  );
}
