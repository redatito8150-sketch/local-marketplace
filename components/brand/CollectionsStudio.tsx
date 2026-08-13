"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  Ellipsis,
  Layers3,
  Loader2,
  Package,
  Pause,
  Pencil,
  Play,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import CollectionCoverCarousel from "./CollectionCoverCarousel";
import CollectionProductPicker from "./CollectionProductPicker";
import { useBrandEdit } from "./BrandEditContext";
import type { CollectionRecord } from "@/types";

const MAX_COLLECTIONS = 10;

interface Draft {
  name: string;
  tagline: string;
  description: string;
  visibleFrom: string;
}

function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDraft(collection: CollectionRecord): Draft {
  return {
    name: collection.name,
    tagline: collection.tagline ?? "",
    description: collection.description ?? "",
    visibleFrom: collection.visibleFrom ? toLocalInputValue(collection.visibleFrom) : "",
  };
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export default function CollectionsStudio({ brandSlug }: { brandSlug: string }) {
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
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/brands/${brandSlug}/collections`);
      const data = (await response.json()) as { collections?: CollectionRecord[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to load collections");
      setCollections(data.collections ?? []);
    } catch {
      setCollections([]);
      setError("We couldn't load your collections. Try refreshing the page.");
    }
  }, [brandSlug]);

  useEffect(() => {
    // Collection data lives outside React; load once access is resolved.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (canEdit) void load();
  }, [canEdit, load]);

  if (!canEdit) return null;

  const scheduledCount = collections?.filter((collection) =>
    collection.isActive && Boolean(collection.visibleFrom) && new Date(collection.visibleFrom!).getTime() > nowMs
  ).length ?? 0;
  const liveCount = collections?.filter((collection) =>
    collection.isActive && (!collection.visibleFrom || new Date(collection.visibleFrom).getTime() <= nowMs)
  ).length ?? 0;
  const pausedCount = collections?.filter((collection) => !collection.isActive).length ?? 0;
  const totalProducts = collections?.reduce((sum, collection) => sum + (collection.productCount ?? 0), 0) ?? 0;

  const saveEdit = async (id: string) => {
    if (!draft.name.trim()) {
      setError("Collection name is required.");
      return;
    }
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/brands/${brandSlug}/collections/${id}`, {
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to save");
      setEditingId(null);
      await load();
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const togglePause = async (collection: CollectionRecord) => {
    setBusyId(collection.id);
    setMenuId(null);
    setError("");
    try {
      const response = await fetch(`/api/brands/${brandSlug}/collections/${collection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: collection.isActive ? "pause" : "resume" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to update collection");
      await load();
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update collection.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (collection: CollectionRecord) => {
    setBusyId(collection.id);
    setError("");
    try {
      const response = await fetch(`/api/brands/${brandSlug}/collections/${collection.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to delete collection");
      setDeleteConfirmId(null);
      setMenuId(null);
      await load();
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete collection.");
    } finally {
      setBusyId(null);
    }
  };

  const createCollection = async () => {
    if (!newName.trim()) {
      setError("Enter a collection name first.");
      return;
    }
    setBusyId("__new__");
    setError("");
    try {
      const response = await fetch(`/api/brands/${brandSlug}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to create collection");
      setNewName("");
      setCreating(false);
      await load();
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create collection.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="pb-10">
      <div className="flex flex-col gap-5 border-b border-[#e7ddd5] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#C85956]">Merchandising</p>
          <h1 className="mt-2 text-[28px] font-bold tracking-[-0.035em] text-ink sm:text-[32px]">Collections</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#776e68] sm:text-sm">
            Build product stories, prepare seasonal edits, and publish each collection when it feels complete.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={!collections || collections.length >= MAX_COLLECTIONS || creating}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#C85956] px-5 text-[12px] font-bold text-white transition hover:bg-[#b94f4c] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Plus className="h-4 w-4" /> Create collection
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-2xl border border-[#e6dcd4] bg-[#fffdfb] sm:grid-cols-4 sm:divide-x sm:divide-[#e6dcd4]">
        {[
          { label: "Live", value: liveCount },
          { label: "Scheduled", value: scheduledCount },
          { label: "Paused", value: pausedCount },
          { label: "Products used", value: totalProducts },
        ].map((item) => (
          <div key={item.label} className="border-b border-[#e6dcd4] px-4 py-4 last:border-b-0 even:border-l sm:border-b-0 sm:border-l-0 sm:px-5">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#958980]">{item.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-[#2f2824]">{collections ? item.value : "—"}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#7d736c]">
        <span>{collections ? `${collections.length} of ${MAX_COLLECTIONS} collection spaces used` : "Loading collection spaces"}</span>
        <Link href={`/brands/${brandSlug}/collections`} className="font-semibold text-[#8f4b49] underline decoration-[#C85956]/35 underline-offset-4 hover:text-[#C85956]">
          Change storefront order
        </Link>
      </div>

      {error && (
        <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-[#efc9c7] bg-[#fff6f5] px-4 py-3 text-[12px] text-[#9f3f3c]">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X className="h-4 w-4" /></button>
        </div>
      )}

      {creating && (
        <div className="mt-6 rounded-2xl border border-[#dfc8bd] bg-[#fff9f5] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-[11px] font-semibold text-[#5f554f]">
              Collection name
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void createCollection()}
                placeholder="e.g. The linen edit"
                maxLength={80}
                autoFocus
                className="mt-1.5 h-10 w-full rounded-xl border border-[#dacdc4] bg-white px-3 text-sm text-[#2f2824] outline-none transition focus:border-[#C85956] focus:ring-2 focus:ring-[#C85956]/10"
              />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="h-10 rounded-full border border-[#d8ccc3] px-4 text-[12px] font-semibold text-[#5e544e] hover:bg-white">Cancel</button>
              <button type="button" onClick={() => void createCollection()} disabled={busyId === "__new__"} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#C85956] px-5 text-[12px] font-bold text-white disabled:opacity-50">
                {busyId === "__new__" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-[#8a7f77]">New collections start paused, so you can prepare them privately.</p>
        </div>
      )}

      {!collections ? (
        <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[#C85956]" /></div>
      ) : collections.length === 0 ? (
        <div className="mt-7 flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-[#d9c9bd] bg-[#fffaf6] px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f4e7df] text-[#C85956]"><Layers3 className="h-5 w-5" /></span>
          <h3 className="mt-4 font-serif text-xl text-[#2f2824]">Start your first product story</h3>
          <p className="mt-2 max-w-sm text-[12.5px] leading-5 text-[#7a7069]">Group products around a season, material, mood, or moment your customers will understand.</p>
          <button type="button" onClick={() => setCreating(true)} className="mt-5 rounded-full bg-[#C85956] px-5 py-2.5 text-[12px] font-bold text-white">Create collection</button>
        </div>
      ) : (
        <div className="mt-7 space-y-5">
          {collections.map((collection) => {
            const isEditing = editingId === collection.id;
            const isBusy = busyId === collection.id;
            const isScheduled = collection.isActive && Boolean(collection.visibleFrom) && new Date(collection.visibleFrom!).getTime() > nowMs;
            const status = !collection.isActive ? "Paused" : isScheduled ? "Scheduled" : "Live";
            const statusClass = status === "Live"
              ? "bg-[#e7f3e9] text-[#347048]"
              : status === "Scheduled"
                ? "bg-[#f8edd9] text-[#8a5d21]"
                : "bg-[#f2e8e6] text-[#9a4e4b]";

            return (
              <article key={collection.id} className="group overflow-hidden rounded-[24px] border border-[#e4d9d0] bg-white transition duration-300 hover:border-[#d8c6ba] hover:shadow-[0_18px_55px_rgba(88,62,46,0.08)]">
                <div className="grid md:grid-cols-[260px_minmax(0,1fr)]">
                  <CollectionCoverCarousel
                    images={collection.coverImageUrls}
                    alt={collection.name}
                    sizes="(min-width: 768px) 260px, 100vw"
                    fillClassName="relative min-h-[220px] w-full md:h-full"
                    editable
                    brandSlug={brandSlug}
                    collectionId={collection.id}
                    onImagesChange={(next) => {
                      setCollections((current) => current?.map((item) => item.id === collection.id ? { ...item, coverImageUrls: next } : item) ?? null);
                      router.refresh();
                    }}
                  />

                  <div className="flex min-w-0 flex-col p-5 sm:p-6">
                    {isEditing ? (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-[11px] font-semibold text-[#655a53] sm:col-span-2">Collection name
                            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={80} className="mt-1.5 h-10 w-full rounded-xl border border-[#dcd0c7] px-3 text-sm outline-none focus:border-[#C85956] focus:ring-2 focus:ring-[#C85956]/10" />
                          </label>
                          <label className="text-[11px] font-semibold text-[#655a53]">Short tag
                            <input value={draft.tagline} onChange={(event) => setDraft({ ...draft, tagline: event.target.value })} placeholder="Summer 2026" maxLength={40} className="mt-1.5 h-10 w-full rounded-xl border border-[#dcd0c7] px-3 text-sm outline-none focus:border-[#C85956] focus:ring-2 focus:ring-[#C85956]/10" />
                          </label>
                          <label className="text-[11px] font-semibold text-[#655a53]">Show starting
                            <input type="datetime-local" value={draft.visibleFrom} onChange={(event) => setDraft({ ...draft, visibleFrom: event.target.value })} className="mt-1.5 h-10 w-full rounded-xl border border-[#dcd0c7] px-3 text-xs outline-none focus:border-[#C85956] focus:ring-2 focus:ring-[#C85956]/10" />
                          </label>
                          <label className="text-[11px] font-semibold text-[#655a53] sm:col-span-2">Description
                            <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} maxLength={1000} className="mt-1.5 w-full rounded-xl border border-[#dcd0c7] px-3 py-2.5 text-sm leading-5 outline-none focus:border-[#C85956] focus:ring-2 focus:ring-[#C85956]/10" />
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-2 border-t border-[#eee5de] pt-4">
                          <button type="button" onClick={() => void saveEdit(collection.id)} disabled={isBusy} className="inline-flex h-9 items-center gap-2 rounded-full bg-[#C85956] px-4 text-[11.5px] font-bold text-white disabled:opacity-50">
                            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save changes
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} disabled={isBusy} className="h-9 rounded-full border border-[#dcd0c7] px-4 text-[11.5px] font-semibold text-[#5e544e]">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[.13em] ${statusClass}`}>{status}</span>
                              {isScheduled && collection.visibleFrom && (
                                <span className="inline-flex items-center gap-1 text-[10.5px] text-[#8a6a42]"><CalendarClock className="h-3 w-3" /> {new Date(collection.visibleFrom).toLocaleDateString()}</span>
                              )}
                            </div>
                            <h3 className="mt-3 truncate font-serif text-[24px] leading-tight text-[#2f2824]">{collection.name}</h3>
                            {collection.tagline && <p className="mt-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#C85956]">{collection.tagline}</p>}
                          </div>

                          <div className="relative shrink-0">
                            <button type="button" onClick={() => { setMenuId(menuId === collection.id ? null : collection.id); setDeleteConfirmId(null); }} aria-label={`More actions for ${collection.name}`} aria-haspopup="menu" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e1d7cf] text-[#5d534d] transition hover:border-[#cdbbb0] hover:bg-[#fff8f4]">
                              <Ellipsis className="h-4 w-4" />
                            </button>
                            {menuId === collection.id && (
                              <div role="menu" className="absolute right-0 top-11 z-20 w-48 rounded-2xl border border-[#e3d8d0] bg-white p-1.5 shadow-[0_16px_45px_rgba(66,45,32,0.16)]">
                                {deleteConfirmId === collection.id ? (
                                  <div className="p-2">
                                    <p className="text-[11px] font-semibold leading-4 text-[#5c514b]">Delete this collection permanently?</p>
                                    <div className="mt-2 flex gap-1.5">
                                      <button type="button" onClick={() => setDeleteConfirmId(null)} className="flex-1 rounded-lg border border-[#ded2ca] px-2 py-1.5 text-[10px] font-semibold">Keep</button>
                                      <button type="button" onClick={() => void remove(collection)} disabled={isBusy} className="flex-1 rounded-lg bg-red-600 px-2 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">Delete</button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <button type="button" role="menuitem" onClick={() => void togglePause(collection)} disabled={isBusy} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[11.5px] font-semibold text-[#554b45] hover:bg-[#f8f1ec] disabled:opacity-50">
                                      {collection.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {collection.isActive ? "Pause collection" : "Resume collection"}
                                    </button>
                                    <button type="button" role="menuitem" onClick={() => setDeleteConfirmId(collection.id)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[11.5px] font-semibold text-red-600 hover:bg-red-50">
                                      <Trash2 className="h-3.5 w-3.5" /> Delete collection
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <p className="mt-3 line-clamp-2 min-h-10 max-w-2xl text-[12.5px] leading-5 text-[#756b64]">
                          {collection.description || "Add a short description to tell shoppers what connects this edit."}
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-[#eee6df] py-3 text-[11px] text-[#756b64]">
                          <span className="inline-flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-[#A55A56]" /><strong className="font-semibold text-[#3f3732]">{collection.productCount ?? 0}</strong> products</span>
                          <span>Updated {formatUpdatedAt(collection.updatedAt)}</span>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-[9.5px] font-bold uppercase tracking-[.15em] text-[#9a8d84]">Product preview</p>
                            <div className="mt-2 flex -space-x-2">
                              {(collection.productPreviewImages ?? []).map((image, index) => (
                                <span key={`${image}-${index}`} className="relative h-9 w-9 overflow-hidden rounded-lg border-2 border-white bg-[#f1e8e1] shadow-sm">
                                  <Image src={image} alt="" fill sizes="36px" className="object-cover" />
                                </span>
                              ))}
                              {(collection.productPreviewImages ?? []).length === 0 && <span className="text-[11px] text-[#9a8f87]">No products added yet</span>}
                              {(collection.productCount ?? 0) > 4 && <span className="relative flex h-9 w-9 items-center justify-center rounded-lg border-2 border-white bg-[#f1e8e1] text-[9.5px] font-bold text-[#655a53]">+{(collection.productCount ?? 0) - 4}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-2">
                          <button type="button" onClick={() => setPickerFor(collection)} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#C85956] px-4 text-[11.5px] font-bold text-white transition hover:bg-[#b94f4c] active:scale-[.98]">
                            <ShoppingBag className="h-3.5 w-3.5" /> Manage products
                          </button>
                          <button type="button" onClick={() => { setDraft(toDraft(collection)); setEditingId(collection.id); setError(""); }} className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d9ccc3] px-4 text-[11.5px] font-semibold text-[#554b45] transition hover:border-[#c8b5aa] hover:bg-[#fff9f5]">
                            <Pencil className="h-3.5 w-3.5" /> Edit details
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pickerFor && (
        <CollectionProductPicker
          brandSlug={brandSlug}
          collectionId={pickerFor.id}
          collectionName={pickerFor.name}
          onClose={() => setPickerFor(null)}
          onSaved={() => { void load(); router.refresh(); }}
        />
      )}
    </div>
  );
}
