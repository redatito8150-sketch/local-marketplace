"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface BrandOption {
  slug: string;
  name: string;
}

export default function LinkUserToBrandField({
  email,
  currentBrand,
  brands,
}: {
  email: string;
  currentBrand?: BrandOption;
  brands: BrandOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleLink = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/brands/${selected}/owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to link brand");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (!currentBrand) return;
    if (!confirm(`Remove ${email}'s brand portal access to ${currentBrand.name}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/brands/${currentBrand.slug}/owner`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to unlink brand");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (currentBrand) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href={`/admin/brands/${currentBrand.slug}/edit`}
          className="text-[12.5px] font-medium text-ink hover:underline"
        >
          {currentBrand.name}
        </Link>
        <button
          type="button"
          onClick={handleUnlink}
          disabled={busy}
          className="text-[11.5px] font-medium text-red-600 hover:underline disabled:opacity-60"
        >
          Unlink
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded-md border border-stone-150 bg-white px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-ink/30"
      >
        <option value="">Not linked</option>
        {brands.map((brand) => (
          <option key={brand.slug} value={brand.slug}>
            {brand.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleLink}
        disabled={busy || !selected}
        className="rounded-md border border-stone-150 bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-ink hover:bg-stone-50 disabled:opacity-40"
      >
        Link
      </button>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
