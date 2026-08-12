"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface BrandOwner {
  id: string;
  email: string | null;
  name: string | null;
}

export default function LinkBrandOwnerField({
  brandSlug,
  owners,
}: {
  brandSlug: string;
  // Every current owner — brands.owner_user_id (the "primary owner"
  // pointer) *and* any brand_staff access_level='owner' co-owner rows,
  // deduplicated. A brand can have more than one; each gets its own Unlink
  // so removing one doesn't leave another with silent, invisible access.
  owners: BrandOwner[];
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

  const handleUnlink = async (owner: BrandOwner) => {
    if (!confirm(`Remove this brand's portal access for ${owner.email ?? owner.name ?? "this account"}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/brands/${brandSlug}/owner`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: owner.id }),
      });
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

  return (
    <div>
      {owners.length > 0 && (
        <div className="space-y-2">
          {owners.map((owner) => (
            <div
              key={owner.id}
              className="flex items-center justify-between rounded-md border border-stone-150 bg-stone-50 px-3.5 py-2.5"
            >
              <span className="text-[13px] text-ink">
                Portal linked to{" "}
                <span className="font-medium">{owner.email ?? owner.name ?? owner.id}</span>
              </span>
              <button
                type="button"
                onClick={() => handleUnlink(owner)}
                disabled={busy}
                className="text-[12px] font-medium text-red-600 hover:underline disabled:opacity-60"
              >
                Unlink
              </button>
            </div>
          ))}
          {owners.length > 1 && (
            <p className="text-[11.5px] text-ink-soft/50">
              This brand has {owners.length} linked owners — unlink each one to fully remove portal access.
            </p>
          )}
        </div>
      )}

      <div className={owners.length > 0 ? "mt-3" : undefined}>
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
          {owners.length > 0 &&
            " If this brand already has a linked owner, linking here replaces them — to add a co-owner without removing the existing one, use Customers & Permissions instead."}
        </p>
        {error && <p className="mt-1.5 text-[12px] text-red-600">{error}</p>}
      </div>
    </div>
  );
}
