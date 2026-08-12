"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pause, Pencil, Play, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import CollectionCoverCarousel from "./CollectionCoverCarousel";
import CollectionProductPicker from "./CollectionProductPicker";
import { useBrandEdit } from "./BrandEditContext";
import type { CollectionRecord } from "@/types";

const MAX_COLLECTIONS = 10;

interface Draft {
  name: string;
  tagline: string;
  description: string;
  visibleFrom: string; // datetime-local value, "" = no schedule
}

function toDraft(collection: CollectionRecord): Draft {
  return {
    name: collection.name,
    tagline: collection.tagline ?? "",
    description: collection.description ?? "",
    visibleFrom: collection.visibleFrom ? toLocalInputValue(collection.visibleFrom) : "",
  };
}

function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The Collections page's own owner/admin-only management panel — every
// collection, whatever its status (paused, scheduled, live), with full
// control (cover photos, name/tag/description, product membership,
// pause/resume, scheduling, delete) directly on this public page, same
// inline-edit philosophy as the About page. Only ever rendered for
// canEdit viewers (see BrandEditContext) — a regular shopper never sees
// this, just the public BrandCollectionsExperience below it.
export default function CollectionsManager({ brandSlug }: { brandSlug: string }) {
  const { canEdit } = useBrandEdit();
  const router = useRouter();
  const [collections, setCollections] = useState<CollectionRecord[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", tagline: "", description: "", visibleFrom: "" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pickerFor, setPickerFor] = useState<CollectionRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  // Read once via useState's lazy initializer rather than calling Date.now()
  // directly during render (impure) — "scheduled" badges compare against
  // this fixed snapshot, which is fine since this panel isn't meant to
  // flip a badge live without a reload anyway.
  const [nowMs] = useState(() => Date.now());

  const load = () => {
    fetch(`/api/brands/${brandSlug}/collections`)
      .then((res) => res.json())
      .then((data: { collections?: CollectionRecord[] }) => setCollections(data.collections ?? []))
      .catch(() => setCollections([]));
  };

  useEffect(() => {
    if (canEdit) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, brandSlug]);

  if (!canEdit) return null;

  const startEdit = (collection: CollectionRecord) => {
    setDraft(toDraft(collection));
    setEditingId(collection.id);
    setError("");
  };

  const saveEdit = async (id: string) => {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/brands/${brandSlug}/collections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateDetails",
          name: draft.name,
          tagline: draft.tagline,
          description: draft.description,
          visibleFrom: draft.visibleFrom ? new Date(draft.visibleFrom).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      setEditingId(null);
      load();
      router.refresh();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const togglePause = async (collection: CollectionRecord) => {
    setBusyId(collection.id);
    setError("");
    try {
      const res = await fetch(`/api/brands/${brandSlug}/collections/${collection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: collection.isActive ? "pause" : "resume" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      load();
      router.refresh();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (collection: CollectionRecord) => {
    if (!window.confirm(`Delete "${collection.name}"? This can't be undone.`)) return;
    setBusyId(collection.id);
    setError("");
    try {
      const res = await fetch(`/api/brands/${brandSlug}/collections/${collection.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to delete");
        return;
      }
      load();
      router.refresh();
    } catch {
      setError("Failed to delete. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const createCollection = async () => {
    if (!newName.trim()) return;
    setBusyId("__new__");
    setError("");
    try {
      const res = await fetch(`/api/brands/${brandSlug}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create");
        return;
      }
      setNewName("");
      setCreating(false);
      load();
      router.refresh();
    } catch {
      setError("Failed to create. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mb-10 rounded-[20px] border border-[#e5d8cd] bg-[#fffaf5] p-5 sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#C85956]">Owner tools</p>
          <h2 className="mt-1 font-serif text-xl text-[#2f2824]">Manage your collections</h2>
        </div>
        {collections && (
          <span className="text-xs text-[#8b8078]">{collections.length}/{MAX_COLLECTIONS}</span>
        )}
      </div>

      {!collections ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#C85956]" /></div>
      ) : (
        <div className="mt-5 space-y-4">
          {collections.map((collection) => {
            const isEditing = editingId === collection.id;
            const isBusy = busyId === collection.id;
            return (
              <div key={collection.id} className="overflow-hidden rounded-2xl border border-[#e6dccf] bg-white">
                <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                  <CollectionCoverCarousel
                    images={collection.coverImageUrls}
                    alt={collection.name}
                    fillClassName="relative h-32 w-full sm:h-full"
                    editable
                    brandSlug={brandSlug}
                    collectionId={collection.id}
                    onImagesChange={(next) => {
                      setCollections((current) =>
                        current?.map((c) => (c.id === collection.id ? { ...c, coverImageUrls: next } : c)) ?? null
                      );
                      // The public BrandCollectionsExperience below is a
                      // separate server-rendered tree from this panel's own
                      // state — without this, an uploaded/removed cover
                      // photo would only ever show up here, never on the
                      // actual public collection card, until a full reload.
                      router.refresh();
                    }}
                  />
                  <div className="min-w-0 p-4">
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          value={draft.name}
                          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          placeholder="Collection name"
                          maxLength={80}
                          className="w-full rounded-md border border-[#ddd2c8] px-2 py-1.5 text-sm font-semibold outline-none focus:border-[#C85956]"
                        />
                        <input
                          value={draft.tagline}
                          onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
                          placeholder="Tag (e.g. Summer 2026)"
                          maxLength={40}
                          className="w-full rounded-md border border-[#ddd2c8] px-2 py-1.5 text-xs outline-none focus:border-[#C85956]"
                        />
                        <textarea
                          value={draft.description}
                          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                          placeholder="Short description"
                          rows={2}
                          maxLength={1000}
                          className="w-full rounded-md border border-[#ddd2c8] px-2 py-1.5 text-xs outline-none focus:border-[#C85956]"
                        />
                        <label className="block text-[11px] text-[#8b8078]">
                          Show starting (optional — leave blank to show now)
                          <input
                            type="datetime-local"
                            value={draft.visibleFrom}
                            onChange={(e) => setDraft({ ...draft, visibleFrom: e.target.value })}
                            className="mt-1 w-full rounded-md border border-[#ddd2c8] px-2 py-1.5 text-xs outline-none focus:border-[#C85956]"
                          />
                        </label>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => saveEdit(collection.id)}
                            disabled={isBusy}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#3fae6a] text-white disabled:opacity-60"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            disabled={isBusy}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600/90 text-white hover:bg-red-600"
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </button>
                          {error && <span className="text-[11px] text-red-600">{error}</span>}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-bold text-[#302925]">{collection.name}</h3>
                            {collection.tagline && <p className="text-[11px] text-[#C85956]">{collection.tagline}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={() => startEdit(collection)}
                            aria-label="Edit collection"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e2d6ca] text-[#4c433e]"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                        {collection.description && (
                          <p className="mt-1.5 line-clamp-2 text-[12px] text-[#766d66]">{collection.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
                          <span className={`rounded-full px-2 py-0.5 ${collection.isActive ? "bg-[#e6f4ea] text-[#2f7a4a]" : "bg-[#f4e6e6] text-[#C85956]"}`}>
                            {collection.isActive ? "Live" : "Paused"}
                          </span>
                          {collection.visibleFrom && new Date(collection.visibleFrom).getTime() > nowMs && (
                            <span className="rounded-full bg-[#fdf0d9] px-2 py-0.5 text-[#8a5a12]">
                              Scheduled {new Date(collection.visibleFrom).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setPickerFor(collection)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#ddd2c8] px-3 py-1.5 text-[11px] font-semibold text-[#4c433e]"
                          >
                            <ShoppingBag className="h-3 w-3" /> Choose products
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePause(collection)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#ddd2c8] px-3 py-1.5 text-[11px] font-semibold text-[#4c433e] disabled:opacity-60"
                          >
                            {collection.isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                            {collection.isActive ? "Pause" : "Resume"}
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(collection)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#f0c9c9] px-3 py-1.5 text-[11px] font-semibold text-red-600 disabled:opacity-60"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {collections.length < MAX_COLLECTIONS &&
            (creating ? (
              <div className="flex items-center gap-2 rounded-2xl border-2 border-[#C85956]/40 bg-white p-3">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New collection name"
                  maxLength={80}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && createCollection()}
                  className="min-w-0 flex-1 rounded-md border border-[#ddd2c8] px-2 py-1.5 text-sm outline-none focus:border-[#C85956]"
                />
                <button
                  type="button"
                  onClick={createCollection}
                  disabled={busyId === "__new__"}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3fae6a] text-white disabled:opacity-60"
                >
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName(""); }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600/90 text-white"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#c9b6a6] px-3 py-4 text-[12px] font-semibold text-[#C85956]"
              >
                <Plus className="h-4 w-4" strokeWidth={2} /> Add collection
              </button>
            ))}
        </div>
      )}

      {pickerFor && (
        <CollectionProductPicker
          brandSlug={brandSlug}
          collectionId={pickerFor.id}
          collectionName={pickerFor.name}
          onClose={() => setPickerFor(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
