"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { ProductTaxonomyContent } from "@/types";

interface CategoryGroup {
  category: string;
  types: string[];
}

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

export default function ProductTaxonomyForm({ initial }: { initial: ProductTaxonomyContent }) {
  const router = useRouter();
  const [groups, setGroups] = useState<CategoryGroup[]>(() =>
    initial.categories.map((c) => ({ category: c, types: initial.typesByCategory[c] ?? [] }))
  );
  const [collections, setCollections] = useState<string[]>(initial.collections);
  const [materials, setMaterials] = useState<string[]>(initial.materials);
  const [fits, setFits] = useState<string[]>(initial.fits);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const updateGroup = (i: number, patch: Partial<CategoryGroup>) =>
    setGroups((g) => g.map((group, idx) => (idx === i ? { ...group, ...patch } : group)));
  const addGroup = () => setGroups((g) => [...g, { category: "", types: [] }]);
  const removeGroup = (i: number) => setGroups((g) => g.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSaved(false);

    const cleanedGroups = groups
      .map((g) => ({
        category: g.category.trim(),
        types: g.types.map((t) => t.trim()).filter(Boolean),
      }))
      .filter((g) => g.category);

    if (cleanedGroups.length === 0) {
      setError("At least one category is required");
      setSubmitting(false);
      return;
    }

    const value: ProductTaxonomyContent = {
      categories: cleanedGroups.map((g) => g.category),
      typesByCategory: Object.fromEntries(cleanedGroups.map((g) => [g.category, g.types])),
      collections: collections.map((c) => c.trim()).filter(Boolean),
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

  const handleReset = async () => {
    if (!confirm("Reset to the original default categories? This can't be undone.")) return;
    setResetting(true);
    try {
      await fetch("/api/admin/site-content/product-taxonomy", { method: "DELETE" });
      window.location.reload();
    } finally {
      setResetting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-[14px] font-semibold text-ink">Categories &amp; Product Types</h2>
        <p className="mt-1 text-[12px] text-ink-soft/50">
          Each category has its own list of product types shown once that category is
          selected in the product form.
        </p>

        <div className="mt-4 space-y-4">
          {groups.map((group, i) => (
            <div key={i} className="rounded-xl3 border border-stone-150 bg-white p-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={group.category}
                  onChange={(e) => updateGroup(i, { category: e.target.value })}
                  placeholder="Category name"
                  className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] font-medium text-ink outline-none focus:border-ink/30"
                />
                <button
                  type="button"
                  onClick={() => removeGroup(i)}
                  className="rounded-md p-2 text-ink-soft/50 hover:bg-stone-100 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.6} />
                </button>
              </div>

              <div className="mt-3 space-y-2 pl-3">
                {group.types.map((type, ti) => (
                  <div key={ti} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={type}
                      onChange={(e) =>
                        updateGroup(i, {
                          types: group.types.map((t, idx) => (idx === ti ? e.target.value : t)),
                        })
                      }
                      placeholder="Product type"
                      className="w-full rounded-md border border-stone-150 bg-white px-3 py-1.5 text-[13px] text-ink outline-none focus:border-ink/30"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateGroup(i, { types: group.types.filter((_, idx) => idx !== ti) })
                      }
                      className="rounded-md p-1.5 text-ink-soft/50 hover:bg-stone-100 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => updateGroup(i, { types: [...group.types, ""] })}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-ink hover:underline"
                >
                  <Plus className="h-3 w-3" strokeWidth={2} />
                  Add product type
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addGroup}
          className="mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink hover:underline"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Add category
        </button>
      </div>

      <SimpleListEditor label="Collections" items={collections} onChange={setCollections} />
      <SimpleListEditor label="Materials" items={materials} onChange={setMaterials} />
      <SimpleListEditor label="Fits" items={fits} onChange={setFits} />

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {saved && !error && <p className="text-[13px] text-green-700">Saved.</p>}

      <div className="flex items-center gap-3 border-t border-stone-150 pt-6">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-ink px-5 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02] disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="rounded-md border border-stone-150 px-4 py-2.5 text-[13px] font-semibold text-ink-soft/70 transition-colors hover:bg-stone-100 disabled:opacity-60"
        >
          {resetting ? "Resetting…" : "Reset to default"}
        </button>
      </div>
    </form>
  );
}
