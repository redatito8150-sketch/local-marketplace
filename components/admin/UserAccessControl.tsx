"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Access = "customer" | "brand_owner" | "brand_assistant" | "staff" | "manager" | "admin";
type AssignMode = "replace" | "add";

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

interface OwnerInfo {
  id: string;
  email: string | null;
  name: string | null;
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
  // Set only while the "this brand already has an owner" warning is up —
  // holds the pending brand so the two choices below know what to act on.
  const [conflict, setConflict] = useState<{ brandSlug: string; owners: OwnerInfo[] } | null>(null);

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

  const saveAccountType = async (
    nextAccess: "customer" | "brand_owner" | "brand_assistant",
    nextBrandSlug?: string,
    mode: AssignMode = "replace"
  ) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access: nextAccess, brandSlug: nextBrandSlug, mode }),
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

  // Brand Owner used to be a single-slot column on the brand itself —
  // picking a second owner silently displaced the first one (their own
  // "Brand Owner" tier stayed put, just with no brand attached anymore,
  // easy to not notice until much later). Now, before ever assigning
  // ownership outright, check who's already there and ask.
  const handleBrandChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const slug = e.target.value;
    setBrandSlug(slug);
    if (!slug) return;

    if (value === "brand_assistant") {
      saveAccountType("brand_assistant", slug);
      return;
    }

    if (value === "brand_owner") {
      setSaving(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/brands/${encodeURIComponent(slug)}/owners`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Failed to check the current owner");
          setSaving(false);
          return;
        }
        const otherOwners: OwnerInfo[] = (data.owners ?? []).filter((owner: OwnerInfo) => owner.id !== userId);
        setSaving(false);
        if (otherOwners.length > 0) {
          setConflict({ brandSlug: slug, owners: otherOwners });
          return;
        }
        await saveAccountType("brand_owner", slug, "replace");
      } catch {
        setError("Failed to check the current owner");
        setSaving(false);
      }
    }
  };

  const resolveConflict = async (mode: AssignMode) => {
    if (!conflict) return;
    const slug = conflict.brandSlug;
    setConflict(null);
    await saveAccountType("brand_owner", slug, mode);
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

      {conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-label="Brand already has an owner">
          <div className="w-full max-w-sm rounded-xl3 bg-white p-6 shadow-card">
            <h3 className="text-[15px] font-bold text-ink">This brand already has an owner</h3>
            <ul className="mt-3 space-y-1.5 text-[13px] text-ink-soft/80">
              {conflict.owners.map((owner) => (
                <li key={owner.id} className="rounded-md bg-stone-50 px-3 py-2">
                  {owner.name || owner.email || owner.id}
                  {owner.name && owner.email ? <span className="text-ink-soft/50"> — {owner.email}</span> : null}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] text-ink-soft/70">
              What do you want to do? Both owners would get identical Brand Owner permissions.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => resolveConflict("add")}
                className="rounded-md bg-ink px-4 py-2.5 text-[13px] font-semibold text-cream"
              >
                Keep {conflict.owners.length === 1 ? "them" : "all of them"} — add this person too
              </button>
              <button
                type="button"
                onClick={() => resolveConflict("replace")}
                className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-semibold text-red-700"
              >
                Remove {conflict.owners.length === 1 ? "them" : "all of them"} — assign only this person
              </button>
              <button
                type="button"
                onClick={() => {
                  setConflict(null);
                  resetToCurrent();
                }}
                className="rounded-md border border-stone-150 px-4 py-2.5 text-[13px] font-semibold text-ink hover:bg-stone-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
