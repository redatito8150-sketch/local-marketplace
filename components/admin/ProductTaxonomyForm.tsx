"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { ProductTaxonomyContent } from "@/types";

function SimpleListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div>
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <div className="mt-2 space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={item}
              onChange={(e) => onChange(items.map((it, idx) => (idx === i ? e.target.value : it)))}
              className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="rounded-md p-2 text-ink-soft/50 hover:bg-stone-100 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.6} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink hover:underline"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Add
      </button>
    </div>
  );
}

// Category/Product Type and Collection are no longer edited here — they're
// driven by the real taxonomy_nodes hierarchy (see the read-only tree above
// this form on /admin/products/categories) and the brand-owned `collections`
// table, respectively. This form still exists for Materials/Fits, and keeps
// whatever categories/typesByCategory/collections values were already
// stored, passed through unchanged on every save — nothing here can modify
// or lose that legacy data, it's just no longer editable through this UI.
export default function ProductTaxonomyForm({ initial }: { initial: ProductTaxonomyContent }) {
  const router = useRouter();
  const [materials, setMaterials] = useState<string[]>(initial.materials);
  const [fits, setFits] = useState<string[]>(initial.fits);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSaved(false);

    const value: ProductTaxonomyContent = {
      categories: initial.categories,
      typesByCategory: initial.typesByCategory,
      collections: initial.collections,
      materials: materials.map((m) => m.trim()).filter(Boolean),
      fits: fits.map((f) => f.trim()).filter(Boolean),
    };

    try {
      const res = await fetch("/api/admin/site-content/product-taxonomy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-8">
      <SimpleListEditor label="Materials" items={materials} onChange={setMaterials} />
      <SimpleListEditor label="Fits" items={fits} onChange={setFits} />

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {saved && !error && <p className="text-[13px] text-green-700">Saved.</p>}

      <div className="flex items-center gap-3 border-t border-stone-150 pt-6">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-mahalyred px-5 py-2.5 text-[13px] font-semibold text-cream disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
