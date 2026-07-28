"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

interface CollectionOption {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

function slugPreview(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Brand-scoped Collection dropdown + inline "Create Collection" modal.
// Reloads its option list whenever `brandId` changes (the parent form is
// responsible for clearing the selected collectionId on that same change —
// see ProductForm's brand-change handler).
export default function CollectionSelect({
  brandId,
  value,
  onChange,
  apiBasePath,
}: {
  brandId: string;
  value: string;
  onChange: (collectionId: string) => void;
  apiBasePath: "/api/brand-portal" | "/api/admin";
}) {
  const [options, setOptions] = useState<CollectionOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const listUrl = brandId
    ? apiBasePath === "/api/admin"
      ? `/api/admin/collections?brandId=${encodeURIComponent(brandId)}`
      : "/api/brand-portal/collections"
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
            .filter((c: { isActive: boolean }) => c.isActive)
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
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!brandId}
        onClick={() => setModalOpen(true)}
        className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink hover:underline disabled:cursor-not-allowed disabled:text-ink-soft/40 disabled:no-underline"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Create Collection
      </button>

      {modalOpen && (
        <CreateCollectionModal
          brandId={brandId}
          apiBasePath={apiBasePath}
          onClose={() => setModalOpen(false)}
          onCreated={async (id) => {
            setModalOpen(false);
            await loadCollections();
            onChange(id);
          }}
        />
      )}
    </div>
  );
}

function CreateCollectionModal({
  brandId,
  apiBasePath,
  onClose,
  onCreated,
}: {
  brandId: string;
  apiBasePath: "/api/brand-portal" | "/api/admin";
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Collection name is required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${apiBasePath}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          ...(apiBasePath === "/api/admin" ? { brandId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      onCreated(data.id);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-label="Create collection">
      <div className="w-full max-w-sm rounded-xl3 bg-white p-6 shadow-card">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-ink">New Collection</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-ink-soft/50 hover:bg-stone-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <label className="block">
            <span className="text-[12.5px] font-medium text-ink-soft/70">Collection Name</span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
            />
            {name.trim() && (
              <span className="mt-1 block text-[11px] text-ink-soft/50">Slug: {slugPreview(name)}</span>
            )}
          </label>
          <label className="block">
            <span className="text-[12.5px] font-medium text-ink-soft/70">Description (optional)</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
            />
          </label>
          {error && (
            <p className="rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">{error}</p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-ink px-4 py-2.5 text-[13px] font-semibold text-cream disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create Collection"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-stone-150 px-4 py-2.5 text-[13px] font-semibold text-ink hover:bg-stone-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
