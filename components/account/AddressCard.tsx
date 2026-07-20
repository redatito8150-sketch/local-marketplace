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
    <div className="rounded-xl3 border border-stone-150 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold text-ink">{address.label}</p>
            {address.isDefault && (
              <span className="flex items-center gap-1 rounded-full bg-beige-100 px-2.5 py-0.5 text-[10.5px] font-semibold text-ink">
                <Star className="h-3 w-3 fill-current" strokeWidth={0} />
                Default
              </span>
            )}
          </div>
          <p className="mt-2 text-[13px] text-ink-soft/80">
            {address.firstName} {address.lastName}
          </p>
          <p className="text-[13px] text-ink-soft/70">{address.phone}</p>
          <p className="mt-1 text-[13px] text-ink-soft/70">
            {address.addressLine}, {address.city}, {address.governorate}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-stone-150 pt-3">
        <Link
          href={`/account/addresses/${address.id}/edit`}
          className="text-[12.5px] font-medium text-ink-soft/70 hover:text-ink hover:underline"
        >
          Edit
        </Link>
        {!address.isDefault && (
          <button
            type="button"
            disabled={busy}
            onClick={handleSetDefault}
            className="text-[12.5px] font-medium text-ink-soft/70 hover:text-ink hover:underline disabled:opacity-50"
          >
            Set as default
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={handleDelete}
          className="text-[12.5px] font-medium text-red-600/80 hover:text-red-700 hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
