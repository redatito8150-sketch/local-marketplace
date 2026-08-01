"use client";

import { useRef, useState } from "react";
import { Pencil, Check, X, Plus } from "lucide-react";
import { useBrandEdit } from "./BrandEditContext";

interface InlineEditableTextProps {
  field: "name" | "tagline" | "city" | "websiteUrl" | "aboutDescription" | "storyBody" | "foundedYear";
  value: string | number | undefined;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  // Multi-line fields (aboutDescription/storyBody) edit in a <textarea>
  // (Escape to cancel, Ctrl/Cmd+Enter to save); everything else is a
  // single-line <input> (Enter to save, Escape to cancel).
  multiline?: boolean;
  placeholder?: string;
  // Plain string, not a callback — a Server Component parent (this is
  // rendered from BrandProfileHeader/about page, neither "use client")
  // can't pass a function prop across to a Client Component at runtime
  // ("Functions cannot be passed directly to Client Components"), so
  // display formatting is limited to prepending a fixed prefix, e.g.
  // prefix="Since " for foundedYear — never fed back into the edit input,
  // which always edits the raw value.
  prefix?: string;
}

// Facebook-style "click the pencil, edit right here" for the handful of
// flat brand-profile fields actually rendered on the public brand page.
// Renders nothing at all when the viewer can't edit and the field is
// empty (so an optional field like storyBody doesn't show a stray "Add"
// prompt to ordinary shoppers) — but an owner/admin viewing that same
// empty field still gets an inline "+ Add" affordance instead of having
// to go find it in a separate dashboard form.
export default function InlineEditableText({
  field,
  value,
  as = "span",
  className = "",
  multiline = false,
  placeholder = "Add",
  prefix = "",
}: InlineEditableTextProps) {
  const { canEdit, brandSlug } = useBrandEdit();
  const [current, setCurrent] = useState(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const Tag = as as React.ElementType;

  if (!canEdit && !current) return null;

  const startEditing = () => {
    setDraft(String(current ?? ""));
    setError("");
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const cancel = () => {
    setEditing(false);
    setError("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/brands/${brandSlug}/inline-edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      setCurrent(data.value ?? draft.trim());
      setEditing(false);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    const display = current ? `${prefix}${current}` : current;
    return <Tag className={className}>{display}</Tag>;
  }

  if (editing) {
    const InputTag = multiline ? "textarea" : "input";
    return (
      <span className="inline-block w-full align-top">
        <InputTag
          ref={inputRef as never}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
            if (!multiline && e.key === "Enter") save();
            if (multiline && (e.metaKey || e.ctrlKey) && e.key === "Enter") save();
          }}
          rows={multiline ? 4 : undefined}
          disabled={saving}
          className={`w-full rounded-md border-2 border-mahalyred/40 bg-white/95 px-2 py-1 text-ink outline-none focus:border-mahalyred ${className}`}
        />
        <span className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            aria-label="Save"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-mahalyred text-cream disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            aria-label="Cancel"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-black/10 text-ink"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          {error && <span className="text-[11px] text-red-600">{error}</span>}
        </span>
      </span>
    );
  }

  if (!current) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className={`inline-flex items-center gap-1.5 rounded-md border border-dashed border-current/40 px-2 py-1 text-[13px] opacity-80 hover:opacity-100 ${className}`}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        {placeholder}
      </button>
    );
  }

  const display = `${prefix}${current}`;
  return (
    <span className="group/inline-edit relative inline-flex items-start gap-1.5">
      <Tag className={className}>{display}</Tag>
      <button
        type="button"
        onClick={startEditing}
        aria-label={`Edit ${field}`}
        className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-black/10 opacity-0 transition-opacity hover:bg-black/20 group-hover/inline-edit:opacity-100"
      >
        <Pencil className="h-3 w-3" strokeWidth={2} />
      </button>
    </span>
  );
}
