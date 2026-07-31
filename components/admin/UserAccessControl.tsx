"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Access = "customer" | "brand_owner" | "brand_assistant" | "staff" | "manager" | "admin";

const BASE_OPTIONS: { value: Access; label: string }[] = [
  { value: "customer", label: "Customer" },
  { value: "brand_owner", label: "Brand Owner" },
  { value: "brand_assistant", label: "Brand Assistant" },
];

interface BrandOption {
  slug: string;
  name: string;
}

interface RoleOption {
  id: string;
  name: string;
}

// Discriminates the select's value: the 3 fixed account-type options
// stay plain strings; every internal-team role is prefixed so it can't
// collide with them.
const roleValue = (roleId: string) => `role:${roleId}`;

export default function UserAccessControl({
  userId,
  currentAccess,
  currentBrand,
  brands,
  roles,
  currentRoleId,
}: {
  userId: string;
  currentAccess: Access;
  currentBrand?: BrandOption;
  brands: BrandOption[];
  roles: RoleOption[];
  currentRoleId: string | null;
}) {
  const router = useRouter();
  const initialValue = currentRoleId ? roleValue(currentRoleId) : currentAccess;
  const [value, setValue] = useState(initialValue);
  const [brandSlug, setBrandSlug] = useState(currentBrand?.slug ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // A currently-held role/tier that isn't in the (rank-filtered) options
  // list — either it outranks the viewer or is a legacy tier with no
  // matching role row yet. Shown so the select never silently jumps to
  // the first real option; stays disabled since the viewer can't grant
  // it anyway.
  const hasUnlistedCurrentValue =
    initialValue !== "customer" &&
    initialValue !== "brand_owner" &&
    initialValue !== "brand_assistant" &&
    !roles.some((r) => roleValue(r.id) === initialValue);

  const resetToCurrent = () => {
    setValue(initialValue);
    setBrandSlug(currentBrand?.slug ?? "");
  };

  const saveAccountType = async (nextAccess: "customer" | "brand_owner" | "brand_assistant", nextBrandSlug?: string) => {
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
        resetToCurrent();
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const saveRole = async (roleId: string | null) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to update access");
        resetToCurrent();
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setValue(next);
    setError("");

    if (next === "brand_owner" || next === "brand_assistant") return; // wait for brand pick
    if (next === "customer") {
      saveAccountType("customer");
      return;
    }
    if (next.startsWith("role:")) {
      saveRole(next.slice("role:".length));
    }
  };

  const handleBrandChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const slug = e.target.value;
    setBrandSlug(slug);
    if (slug && (value === "brand_owner" || value === "brand_assistant")) {
      saveAccountType(value, slug);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={value}
        onChange={handleChange}
        disabled={saving}
        className="rounded-md border border-stone-150 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-ink outline-none focus:border-ink/30 disabled:opacity-60"
      >
        {BASE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        {roles.map((role) => (
          <option key={role.id} value={roleValue(role.id)}>
            {role.name}
          </option>
        ))}
        {hasUnlistedCurrentValue && (
          <option value={initialValue} disabled>
            {currentAccess} (outranks you)
          </option>
        )}
      </select>
      {(value === "brand_owner" || value === "brand_assistant") && (
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
