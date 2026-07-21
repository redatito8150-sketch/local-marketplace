"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MoodTileContent } from "@/types";

export default function ShopByMoodForm({ initial }: { initial: MoodTileContent[] }) {
  const router = useRouter();
  const [tiles, setTiles] = useState<MoodTileContent[]>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const updateTile = (i: number, patch: Partial<MoodTileContent>) =>
    setTiles((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addTile = () =>
    setTiles((rows) => [...rows, { id: "", label: "", image: "", href: "" }]);
  const removeTile = (i: number) =>
    setTiles((rows) => rows.filter((_, idx) => idx !== i));

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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
                  Label <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={tile.label}
                  onChange={(e) => updateTile(i, { label: e.target.value })}
                  className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
                  Link <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={tile.href}
                  onChange={(e) => updateTile(i, { href: e.target.value })}
                  className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
                Image URL <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={tile.image}
                onChange={(e) => updateTile(i, { image: e.target.value })}
                className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
              />
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
    </form>
  );
}
