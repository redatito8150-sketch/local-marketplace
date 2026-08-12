"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { GripVertical } from "lucide-react";
import { useBrandEdit } from "./BrandEditContext";
import type { CollectionRecord } from "@/types";

// The brand profile's *only* Collections capability now — drag to reorder,
// nothing else. Creating/editing/deleting a collection (name, tag,
// description, cover photos, product membership, pause, scheduling) all
// live in exactly one place, /brand-portal/collections
// (components/brand/CollectionsManager) — this panel only ever reads and
// reorders what's already there, closing the "3 disconnected places to
// make a collection" gap. Position 0 becomes the featured collection on
// the public experience below (BrandCollectionsExperience treats
// collections[0] as featured) — dragging a collection to the front *is*
// choosing it as featured, no separate toggle needed.
export default function CollectionsOrderPanel({ brandSlug }: { brandSlug: string }) {
  const { canEdit } = useBrandEdit();
  const router = useRouter();
  const [collections, setCollections] = useState<CollectionRecord[] | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canEdit) return;
    fetch(`/api/brands/${brandSlug}/collections`)
      .then((res) => res.json())
      .then((data: { collections?: CollectionRecord[] }) => setCollections(data.collections ?? []))
      .catch(() => setCollections([]));
  }, [canEdit, brandSlug]);

  if (!canEdit || !collections || collections.length < 2) return null;

  const save = async (next: CollectionRecord[]) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/brands/${brandSlug}/collections/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((c) => c.id) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save order");
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const next = [...collections];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDragIndex(null);
    setCollections(next);
    void save(next);
  };

  return (
    <div className="mb-8 rounded-[20px] border border-[#e5d8cd] bg-[#fffaf5] p-5 sm:p-6">
      <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#C85956]">Owner tools</p>
      <h2 className="mt-1 font-serif text-lg text-[#2f2824]">Drag to reorder — the first is your featured collection</h2>
      <p className="mt-1 text-[11px] text-[#8b8078]">
        To create, edit, or delete a collection, use{" "}
        <a href={`/brand-portal/collections?brand=${encodeURIComponent(brandSlug)}`} target="_blank" rel="noreferrer" className="font-semibold underline">
          Collections in your brand portal
        </a>
        .
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {collections.map((collection, index) => (
          <div
            key={collection.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDrop(index)}
            onDragEnd={() => setDragIndex(null)}
            className={`flex w-44 cursor-grab items-center gap-2 rounded-xl border bg-white p-2 transition active:cursor-grabbing ${
              dragIndex === index ? "opacity-40" : "border-[#e6dccf]"
            } ${index === 0 ? "ring-2 ring-[#c9962c] ring-offset-1" : ""}`}
          >
            <GripVertical className="h-4 w-4 shrink-0 text-[#a89a8c]" />
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[#eee5db]">
              {collection.coverImageUrls[0] && (
                <Image src={collection.coverImageUrls[0]} alt="" fill sizes="40px" className="object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-[#242424]">{collection.name}</p>
              <p className="text-[10px] text-[#8b8078]">{index === 0 ? "Featured" : collection.isActive ? "Live" : "Paused"}</p>
            </div>
          </div>
        ))}
      </div>
      {saving && <p className="mt-2 text-[11px] text-[#8b8078]">Saving order…</p>}
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
