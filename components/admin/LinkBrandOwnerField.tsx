"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LinkBrandOwnerField({
  brandSlug,
  currentOwnerEmail,
}: {
  brandSlug: string;
  currentOwnerEmail?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleLink = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/brands/${brandSlug}/owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to link owner");
        return;
      }
      setEmail("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm("Remove this brand's portal access for its current owner?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/brands/${brandSlug}/owner`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to unlink owner");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (currentOwnerEmail) {
    return (
      <div className="flex items-center justify-between rounded-md border border-stone-150 bg-stone-50 px-3.5 py-2.5">
        <span className="text-[13px] text-ink">
          Portal linked to <span className="font-medium">{currentOwnerEmail}</span>
        </span>
        <button
          type="button"
          onClick={handleUnlink}
          disabled={busy}
          className="text-[12px] font-medium text-red-600 hover:underline disabled:opacity-60"
        >
          Unlink
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="owner@brand.com"
          className="flex-1 rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
        />
        <button
          type="button"
          onClick={handleLink}
          disabled={busy || !email.trim()}
          className="rounded-md border border-stone-150 bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink hover:bg-stone-50 disabled:opacity-60"
        >
          Link
        </button>
      </div>
      <p className="mt-1.5 text-[11.5px] text-ink-soft/50">
        The account must already exist — they sign up like any customer first.
      </p>
      {error && <p className="mt-1.5 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
