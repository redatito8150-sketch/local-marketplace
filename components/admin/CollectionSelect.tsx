"use client";

import { useEffect, useState } from "react";

interface CollectionOption {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

// Brand-scoped Collection dropdown — read-only picker, on purpose. Creating
// and managing collections used to be possible from here too (an inline
// "Create Collection"/"Manage Collections" modal), which was one of 3
// separate places a brand could end up creating a collection with no link
// between them. Collection creation/editing now lives in exactly one place,
// /brand-portal/collections (components/brand/CollectionsManager) — this
// component only ever lists what's already there. Reloads its option list
// whenever `brandId` changes (the parent form is responsible for clearing
// the selected collectionId on that same change — see ProductForm's
// brand-change handler).
export default function CollectionSelect({
  brandId,
  value,
  onChange,
  apiBasePath,
  brandSlug,
}: {
  brandId: string;
  value: string;
  onChange: (collectionId: string) => void;
  apiBasePath: "/api/brand-portal" | "/api/admin";
  brandSlug?: string;
}) {
  const [options, setOptions] = useState<CollectionOption[]>([]);
  const [loading, setLoading] = useState(false);

  const listUrl = brandId
    ? apiBasePath === "/api/admin"
      ? `/api/admin/collections?brandId=${encodeURIComponent(brandId)}`
      : `/api/brand-portal/collections${brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : ""}`
    : null;

  const loadCollections = async () => {
    if (!listUrl) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(listUrl);
      const data = await res.json();
      if (res.ok) {
        setOptions(
          (data.collections ?? [])
            .map((c: { id: string; name: string; slug: string; isActive: boolean }) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
              isActive: c.isActive,
            }))
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetching from the network on a prop change (brandId) is the
    // canonical use of an effect — the setState calls inside
    // loadCollections happen in its own later microtask/callback, not
    // synchronously in the effect body itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  return (
    <div>
      <label className="block">
        <span className="text-[12.5px] font-medium text-ink-soft/70">Collection</span>
        <select
          value={value}
          disabled={!brandId || loading}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-ink-soft/40"
        >
          <option value="">No collection</option>
          {options.filter((option) => option.isActive || option.id === value).map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      {apiBasePath === "/api/brand-portal" && (
        <a
          href={`/brand-portal/collections${brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : ""}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-block text-[12px] font-semibold text-ink hover:underline"
        >
          Create or manage collections →
        </a>
      )}
    </div>
  );
}
