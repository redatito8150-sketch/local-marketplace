"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, Loader2, X } from "lucide-react";

interface PickerProduct {
  id: string;
  name: string;
  image: string;
  inThisCollection: boolean;
  status: string;
}

// Fast multi-select for "which products belong in this collection" —
// replaces having to open each product individually and set its
// collection one at a time. Fetches the brand's full product list on
// open, lets the owner check/uncheck freely, and saves the *whole*
// membership at once via POST .../collections/[id]/products.
export default function CollectionProductPicker({
  brandSlug,
  collectionId,
  collectionName,
  onClose,
  onSaved,
}: {
  brandSlug: string;
  collectionId: string;
  collectionName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [products, setProducts] = useState<PickerProduct[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/brands/${brandSlug}/collections/${collectionId}/products`)
      .then((res) => res.json())
      .then((data: { products?: PickerProduct[]; error?: string }) => {
        if (cancelled) return;
        if (data.products) {
          setProducts(data.products);
          setSelected(new Set(data.products.filter((p) => p.inThisCollection).map((p) => p.id)));
        } else {
          setError(data.error ?? "Failed to load products");
        }
      })
      .catch(() => !cancelled && setError("Failed to load products"));
    return () => {
      cancelled = true;
    };
  }, [brandSlug, collectionId]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/brands/${brandSlug}/collections/${collectionId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = (products ?? []).filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#eee5dc] px-5 py-4">
          <div>
            <h2 className="font-serif text-lg text-[#261f1b]">Choose products</h2>
            <p className="text-xs text-[#8b8078]">For &quot;{collectionName}&quot; — {selected.size} selected</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[#eee5dc] px-5 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your products"
            className="w-full rounded-full border border-[#ddd2c8] px-4 py-2 text-sm outline-none focus:border-[#8f2634]"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {!products ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#8f2634]" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#8b8078]">No products match.</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((product) => {
                const checked = selected.has(product.id);
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => toggle(product.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                        checked ? "border-[#8f2634] bg-[#fff2f2]" : "border-transparent hover:bg-[#f8f2ec]"
                      }`}
                    >
                      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-[#f1e9e1]">
                        <Image src={product.image} alt="" fill sizes="44px" className="object-cover" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-[#332b27]">
                        {product.name}
                        {product.status === "archived" && (
                          <span className="ml-1.5 rounded-full bg-[#f1eae2] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[#8a7d73]">
                            Archived
                          </span>
                        )}
                      </span>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          checked ? "border-[#8f2634] bg-[#8f2634] text-white" : "border-[#ddd2c8]"
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#eee5dc] px-5 py-4">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="rounded-full border border-[#ddd2c8] px-4 py-2 text-xs font-semibold text-[#4c433e]">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={loading}
              className="rounded-full bg-[#3fae6a] px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {loading ? "Saving..." : "Save products"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
