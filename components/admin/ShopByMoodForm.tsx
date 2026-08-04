"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { X } from "lucide-react";
import type { MoodTileContent } from "@/types";
import MoodProductPicker, { type PickerProduct } from "./MoodProductPicker";

const MAX_IMAGES = 4;

export default function ShopByMoodForm({ initial }: { initial: MoodTileContent[] }) {
  const router = useRouter();
  const [tiles, setTiles] = useState<MoodTileContent[]>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [catalog, setCatalog] = useState<PickerProduct[]>([]);
  const [pickerForIndex, setPickerForIndex] = useState<number | null>(null);

  // Fetched once and shared across every tile's product picker and its
  // selected-products chip list, rather than each tile re-fetching the
  // whole published catalog.
  useEffect(() => {
    fetch("/api/admin/products/picker")
      .then((res) => res.json())
      .then((data: { products?: PickerProduct[] }) => setCatalog(data.products ?? []))
      .catch(() => setCatalog([]));
  }, []);

  const catalogById = new Map(catalog.map((p) => [p.id, p]));

  const updateTile = (i: number, patch: Partial<MoodTileContent>) =>
    setTiles((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addTile = () =>
    setTiles((rows) => [...rows, { id: "", label: "", images: [], productIds: [] }]);
  const removeTile = (i: number) =>
    setTiles((rows) => rows.filter((_, idx) => idx !== i));

  const addImage = (i: number, url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setTiles((rows) =>
      rows.map((r, idx) => (idx === i && r.images.length < MAX_IMAGES ? { ...r, images: [...r.images, trimmed] } : r))
    );
  };
  const removeImage = (i: number, imgIndex: number) =>
    setTiles((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, images: r.images.filter((_, ii) => ii !== imgIndex) } : r))
    );

  const removeProduct = (i: number, productId: string) =>
    setTiles((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, productIds: r.productIds.filter((id) => id !== productId) } : r))
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/admin/site-content/shop-by-mood", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiles }),
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
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="space-y-4">
        {tiles.map((tile, i) => (
          <div key={i} className="rounded-xl3 border border-stone-150 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-ink">Tile {i + 1}</h2>
              {tiles.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTile(i)}
                  className="text-[12px] text-ink-soft/60 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>

            <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
              Label <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={tile.label}
              onChange={(e) => updateTile(i, { label: e.target.value })}
              className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
            />

            <div className="mt-4">
              <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
                Images <span className="text-red-600">*</span> — up to {MAX_IMAGES}, shown as a rotating cover
              </label>
              {tile.images.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {tile.images.map((url, imgIndex) => (
                    <div key={imgIndex} className="group relative h-16 w-16 flex-none overflow-hidden rounded-md border border-stone-150 bg-stone-50">
                      <Image src={url} alt="" fill sizes="64px" className="object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i, imgIndex)}
                        aria-label="Remove image"
                        className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {tile.images.length < MAX_IMAGES && (
                <input
                  type="text"
                  placeholder="Paste an image URL and press Enter"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    addImage(i, e.currentTarget.value);
                    e.currentTarget.value = "";
                  }}
                  className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
                />
              )}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label className="text-[12.5px] font-medium text-ink-soft/70">
                  Products shown when this mood is opened
                </label>
                <button
                  type="button"
                  onClick={() => setPickerForIndex(i)}
                  className="text-[12px] font-semibold text-ink hover:underline"
                >
                  Choose products…
                </button>
              </div>
              {tile.productIds.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {tile.productIds.map((id) => {
                    const product = catalogById.get(id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-stone-150 bg-stone-50 py-1 pl-1 pr-2 text-[11.5px] text-ink">
                        {product && (
                          <span className="relative h-5 w-5 overflow-hidden rounded-full bg-stone-200">
                            <Image src={product.image} alt="" fill sizes="20px" className="object-cover" />
                          </span>
                        )}
                        {product?.name ?? id}
                        <button type="button" onClick={() => removeProduct(i, id)} aria-label="Remove product" className="text-ink-soft/50 hover:text-red-700">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-1.5 text-[12px] text-ink-soft/50">No products picked yet — this mood will show empty until you choose some.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addTile}
        className="text-[12.5px] font-semibold text-ink hover:underline"
      >
        + Add tile
      </button>

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {saved && !error && <p className="text-[13px] text-green-700">Saved.</p>}

      <div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-mahalyred px-5 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02] disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
      </div>

      {pickerForIndex !== null && (
        <MoodProductPicker
          title={tiles[pickerForIndex].label || `Tile ${pickerForIndex + 1}`}
          catalog={catalog}
          initialSelected={tiles[pickerForIndex].productIds}
          onClose={() => setPickerForIndex(null)}
          onSave={(ids) => {
            updateTile(pickerForIndex, { productIds: ids });
            setPickerForIndex(null);
          }}
        />
      )}
    </form>
  );
}
