"use client";

import { useRef, useState } from "react";
import { Bold, Check, Download, Italic, Loader2, Pencil, Plus, X } from "lucide-react";
import { useBrandEdit } from "./BrandEditContext";

// The one rich-text field on the brand About page (the combined intro —
// see app/brands/[slug]/about/page.tsx). Deliberately minimal: Bold,
// Italic, and 2 bounded size variants (rt-size-sm/rt-size-lg, capped in
// app/globals.css so a brand can't blow up the page's typography) — never
// arbitrary font sizes or colors. The server (see
// app/api/brands/[slug]/inline-edit's aboutDescription branch and
// lib/sanitizeRichText.ts) re-sanitizes on every save regardless of what
// this toolbar would ever produce; that's the real trust boundary, not
// this component.
export default function RichTextEditableField({
  field,
  value,
  className = "",
  placeholder = "Add",
  canImport = false,
}: {
  field: "aboutDescription";
  value: string;
  className?: string;
  placeholder?: string;
  canImport?: boolean;
}) {
  const { canEdit, brandSlug } = useBrandEdit();
  const [current, setCurrent] = useState(value);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);

  const startEditing = () => {
    setError("");
    setEditing(true);
    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = current || "";
        editorRef.current.focus();
      }
    });
  };

  const cancel = () => {
    setEditing(false);
    setError("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const html = editorRef.current?.innerHTML ?? "";
      const res = await fetch(`/api/brands/${brandSlug}/inline-edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: html }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      setCurrent(data.value ?? html);
      setEditing(false);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const importStory = async () => {
    setImporting(true);
    setError("");
    try {
      const res = await fetch(`/api/brands/${brandSlug}/application-story`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Nothing to import");
        return;
      }
      if (editorRef.current) editorRef.current.innerText = data.story;
    } catch {
      setError("Import failed. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  const exec = (command: "bold" | "italic") => {
    editorRef.current?.focus();
    document.execCommand(command);
  };

  const wrapSelection = (sizeClass: string) => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!editorRef.current?.contains(range.commonAncestorContainer)) return;
    const span = document.createElement("span");
    span.className = sizeClass;
    span.appendChild(range.extractContents());
    range.insertNode(span);
    sel.removeAllRanges();
  };

  if (!canEdit && !current) return null;

  if (!canEdit) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: current }} />;
  }

  if (editing) {
    return (
      <div className="rounded-xl border-2 border-mahalyred/40 bg-white/95 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-black/10 pb-2">
          <button type="button" onClick={() => exec("bold")} aria-label="Bold" className="flex h-7 w-7 items-center justify-center rounded-md text-ink hover:bg-black/5">
            <Bold className="h-3.5 w-3.5" strokeWidth={2.2} />
          </button>
          <button type="button" onClick={() => exec("italic")} aria-label="Italic" className="flex h-7 w-7 items-center justify-center rounded-md text-ink hover:bg-black/5">
            <Italic className="h-3.5 w-3.5" strokeWidth={2.2} />
          </button>
          <button type="button" onClick={() => wrapSelection("rt-size-lg")} aria-label="Larger text" className="flex h-7 items-center justify-center rounded-md px-2 text-xs font-bold text-ink hover:bg-black/5">
            A+
          </button>
          <button type="button" onClick={() => wrapSelection("rt-size-sm")} aria-label="Smaller text" className="flex h-7 items-center justify-center rounded-md px-2 text-xs font-bold text-ink hover:bg-black/5">
            A-
          </button>
          {canImport && (
            <button
              type="button"
              onClick={importStory}
              disabled={importing}
              className="ml-auto flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-mahalyred hover:bg-mahalyred/10 disabled:opacity-60"
            >
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Import from your application
            </button>
          )}
        </div>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="About description"
          aria-multiline="true"
          className={`min-h-[110px] rounded-md outline-none ${className}`}
        />
        <div className="mt-2 flex items-center gap-2">
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
            className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600/90 text-white hover:bg-red-600"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          {error && <span className="text-[11px] text-red-600">{error}</span>}
        </div>
      </div>
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

  return (
    <span className="group/inline-edit relative block">
      <div className={className} dangerouslySetInnerHTML={{ __html: current }} />
      <button
        type="button"
        onClick={startEditing}
        aria-label={`Edit ${field}`}
        className="absolute -top-2 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-black/10 opacity-0 transition-opacity hover:bg-black/20 group-hover/inline-edit:opacity-100"
      >
        <Pencil className="h-3 w-3" strokeWidth={2} />
      </button>
    </span>
  );
}
