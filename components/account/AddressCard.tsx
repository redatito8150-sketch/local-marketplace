"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import type { AddressRecord } from "@/types";

export default function AddressCard({ address }: { address: AddressRecord }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleSetDefault = async () => {
    setBusy(true);
    await fetch(`/api/account/addresses/${address.id}/default`, { method: "POST" });
    router.refresh();
    setBusy(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete the "${address.label}" address?`)) return;
    setBusy(true);
    await fetch(`/api/account/addresses/${address.id}`, { method: "DELETE" });
    router.refresh();
    setBusy(false);
  };

  return (
    <div className="rounded-[20px] border border-[var(--account-border)] bg-[var(--account-surface)] p-5 shadow-[var(--account-shadow)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold text-[var(--account-text)]">{address.label}</p>
            {address.isDefault && (
              <span className="flex items-center gap-1 rounded-full bg-[var(--account-accent-soft)] px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--account-accent)]">
                <Star className="h-3 w-3 fill-current" strokeWidth={0} />
                Default
              </span>
            )}
          </div>
          <p className="mt-2 text-[13px] text-[var(--account-text)]">
            {address.firstName} {address.lastName}
          </p>
          <p className="text-[13px] text-[var(--account-text-muted)]">{address.phone}</p>
          <p className="mt-1 text-[13px] text-[var(--account-text-muted)]">
            {address.addressLine}, {address.city}, {address.governorate}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[var(--account-border)] pt-3">
        <Link
          href={`/account/addresses/${address.id}/edit`}
          className="text-[12.5px] font-semibold text-[var(--account-accent)] hover:underline"
        >
          Edit
        </Link>
        {!address.isDefault && (
          <button
            type="button"
            disabled={busy}
            onClick={handleSetDefault}
            className="text-[12.5px] font-semibold text-[var(--account-text-muted)] hover:text-[var(--account-accent)] hover:underline disabled:opacity-50"
          >
            Set as default
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={handleDelete}
          className="text-[12.5px] font-semibold text-[var(--account-danger)] hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
