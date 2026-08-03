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
  userEmail,
  userName,
  currentAccess,
  currentBrand,
  brands,
  roles,
  currentRoleId,
}: {
  userId: string;
  // The account this control assigns access to — shown in the "add this
  // person too" row of the owner-conflict dialog below, so the admin can
  // tell at a glance who they're about to add alongside the existing owners.
  userEmail: string | null;
  userName: string | null;
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
  // Set only while the owner-conflict checklist is up — holds the pending
  // brand and its current owners so the checklist below knows what to act on.
  const [conflict, setConflict] = useState<{ brandSlug: string; owners: OwnerInfo[] } | null>(null);
  // Which of conflict.owners stay a Brand Owner — unchecking one demotes
  // them to plain customer instead of the old all-or-nothing choice.
  const [keepOwnerIds, setKeepOwnerIds] = useState<Set<string>>(new Set());
  // Whether this account (the one the select is for) actually gets added
  // as a co-owner — lets the admin back out of adding them without
  // cancelling the whole dialog and losing the keep/remove choices above.
  const [addNewPerson, setAddNewPerson] = useState(true);

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
          setKeepOwnerIds(new Set(otherOwners.map((owner) => owner.id)));
          setAddNewPerson(true);
          return;
        }
        await saveAccountType("brand_owner", slug, "replace");
      } catch {
        setError("Failed to check the current owner");
        setSaving(false);
      }
    }
  };

  const toggleKeepOwner = (ownerId: string) => {
    setKeepOwnerIds((prev) => {
      const next = new Set(prev);
      if (next.has(ownerId)) next.delete(ownerId);
      else next.add(ownerId);
      return next;
    });
  };

  const confirmConflict = async () => {
    if (!conflict) return;
    const { brandSlug: slug, owners } = conflict;
    const toDemote = owners.filter((owner) => !keepOwnerIds.has(owner.id));
    setConflict(null);
    setSaving(true);
    setError("");
    try {
      if (addNewPerson) {
        // 'add' — every currently-kept owner's link is left untouched;
        // anyone unchecked above is demoted separately below instead of
        // relying on 'replace' (which would wipe every other owner, not
        // just the unchecked ones).
        const res = await fetch(`/api/admin/users/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access: "brand_owner", brandSlug: slug, mode: "add" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Failed to update access");
          resetToCurrent();
          return;
        }
      } else {
        resetToCurrent();
      }
      await Promise.all(
        toDemote.map((owner) =>
          fetch(`/api/admin/users/${owner.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access: "customer" }),
          })
        )
      );
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const cancelConflict = () => {
    setConflict(null);
    resetToCurrent();
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-label="Manage brand owners">
          <div className="w-full max-w-sm rounded-xl3 bg-white p-6 shadow-card">
            <h3 className="text-[15px] font-bold text-ink">This brand already has an owner</h3>
            <p className="mt-1.5 text-[12.5px] text-ink-soft/70">
              Uncheck anyone who should lose Brand Owner access — they go back to a plain
              customer. Everyone left checked keeps identical Brand Owner permissions.
            </p>

            <div className="mt-4 space-y-2">
              {conflict.owners.map((owner) => (
                <label
                  key={owner.id}
                  className="flex items-start gap-2.5 rounded-md border border-stone-150 px-3 py-2.5"
                >
                  <input
                    type="checkbox"
                    checked={keepOwnerIds.has(owner.id)}
                    onChange={() => toggleKeepOwner(owner.id)}
                    className="mt-0.5 h-4 w-4 flex-none accent-ink"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {owner.name || owner.email || owner.id}
                    </span>
                    {owner.email && (
                      <span className="block truncate text-[11.5px] text-ink-soft/50">{owner.email}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            <div className="my-4 border-t border-stone-150" />

            <label className="flex items-start gap-2.5 rounded-md border border-stone-150 px-3 py-2.5">
              <input
                type="checkbox"
                checked={addNewPerson}
                onChange={(e) => setAddNewPerson(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-none accent-ink"
              />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-ink">
                  {userName || userEmail || "This account"}
                </span>
                {userEmail && <span className="block truncate text-[11.5px] text-ink-soft/50">{userEmail}</span>}
              </span>
            </label>

            {error && <p className="mt-3 text-[11.5px] text-red-600">{error}</p>}

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={confirmConflict}
                className="rounded-md bg-ink px-4 py-2.5 text-[13px] font-semibold text-cream"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={cancelConflict}
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
