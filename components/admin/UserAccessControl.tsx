"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Access = "customer" | "brand_owner" | "brand_assistant" | "staff" | "manager" | "admin";

const ACCESS_OPTIONS: { value: Access; label: string }[] = [
  { value: "customer", label: "Customer" },
  { value: "brand_owner", label: "Brand Owner" },
  { value: "brand_assistant", label: "Brand Assistant" },
  { value: "staff", label: "Staff (read-only + order status)" },
  { value: "manager", label: "Manager (day-to-day control)" },
  { value: "admin", label: "Admin (full control)" },
];

interface BrandOption {
  slug: string;
  name: string;
}

export default function UserAccessControl({
  userId,
  currentAccess,
  currentBrand,
  brands,
}: {
  userId: string;
  currentAccess: Access;
  currentBrand?: BrandOption;
  brands: BrandOption[];
}) {
  const router = useRouter();
  const [access, setAccess] = useState<Access>(currentAccess);
  const [brandSlug, setBrandSlug] = useState(currentBrand?.slug ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (nextAccess: Access, nextBrandSlug?: string) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access: nextAccess, brandSlug: nextBrandSlug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to update access");
        setAccess(currentAccess);
        setBrandSlug(currentBrand?.slug ?? "");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleAccessChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as Access;
    setAccess(next);
    setError("");
    // "Brand Owner"/"Brand Assistant" both need a brand picked before they
    // mean anything — wait for that second choice instead of saving an
    // incomplete state.
    if (next === "brand_owner" || next === "brand_assistant") return;
    save(next);
  };

  const handleBrandChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const slug = e.target.value;
    setBrandSlug(slug);
    if (slug) save(access, slug);
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={access}
        onChange={handleAccessChange}
        disabled={saving}
        className="rounded-md border border-stone-150 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-ink outline-none focus:border-ink/30 disabled:opacity-60"
      >
        {ACCESS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {(access === "brand_owner" || access === "brand_assistant") && (
        <select
          value={brandSlug}
          onChange={handleBrandChange}
          disabled={saving}
          className="rounded-md border border-stone-150 bg-white px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-ink/30 disabled:opacity-60"
        >
          <option value="">Select brand…</option>
          {brands.map((brand) => (
            <option key={brand.slug} value={brand.slug}>
              {brand.name}
            </option>
          ))}
        </select>
      )}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
