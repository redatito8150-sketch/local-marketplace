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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2f2824]/35 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-[24px] border border-white/70 bg-[#fffdfb] shadow-[0_28px_90px_rgba(55,37,27,0.24)]">
        <div className="flex items-center justify-between border-b border-[#eee5dc] px-5 py-5 sm:px-6">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[.17em] text-[#C85956]">Collection products</p>
            <h2 className="mt-1 font-serif text-xl text-[#261f1b]">{collectionName}</h2>
            <p className="mt-1 text-xs text-[#8b8078]">
              {products ? `${selected.size} products selected` : "Loading products…"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[#eee5dc] px-5 py-3.5 sm:px-6">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your products"
            className="h-10 w-full rounded-xl border border-[#ddd2c8] bg-white px-4 text-sm outline-none transition focus:border-[#C85956] focus:ring-2 focus:ring-[#C85956]/10"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 sm:px-6">
          {!products ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#C85956]" /></div>
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
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                        checked ? "border-[#dba4a1] bg-[#fff3f1]" : "border-transparent hover:bg-[#f8f2ec]"
                      }`}
                    >
                      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-[#f1e9e1]">
                        <Image src={product.image} alt="" fill sizes="44px" className="object-cover" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-[#242424]">
                        {product.name}
                        {product.status === "archived" && (
                          <span className="ml-1.5 rounded-full bg-[#f1eae2] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[#8a7d73]">
                            Archived
                          </span>
                        )}
                      </span>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          checked ? "border-[#C85956] bg-[#C85956] text-white" : "border-[#ddd2c8]"
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

        <div className="flex items-center justify-between gap-3 border-t border-[#eee5dc] px-5 py-4 sm:px-6">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="h-10 rounded-full border border-[#ddd2c8] px-5 text-xs font-semibold text-[#4c433e] hover:bg-white">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={loading}
              className="h-10 rounded-full bg-[#C85956] px-5 text-xs font-bold text-white transition hover:bg-[#b94f4c] active:scale-[.98] disabled:opacity-60"
            >
              {loading ? "Saving..." : "Save products"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
