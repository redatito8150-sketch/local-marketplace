"use client";

import { useRef } from "react";
import { Bold, Italic, Link as LinkIcon, List } from "lucide-react";
import { DESCRIPTION_MAX_LENGTH } from "@/lib/admin/productValidation";

// A plain textarea with a lightweight formatting toolbar (Bold/Italic/
// Bullet List/Link) that inserts a small Markdown-like syntax around the
// current selection — not a rich-text/WYSIWYG editor, no new storage
// format: products.description stays plain text, and
// lib/format/richText.tsx renders that same syntax back out on the
// storefront and in the Live Preview.
export default function DescriptionEditor({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyWrap = (before: string, after: string = before) => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const selected = value.slice(selectionStart, selectionEnd) || "text";
    const next = value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
    onChange(next.slice(0, DESCRIPTION_MAX_LENGTH));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectionStart + before.length, selectionStart + before.length + selected.length);
    });
  };

  const applyLinePrefix = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const lineEndIndex = value.indexOf("\n", selectionEnd);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split("\n").map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line));
    const nextBlock = lines.join("\n");
    const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd);
    onChange(next.slice(0, DESCRIPTION_MAX_LENGTH));
    requestAnimationFrame(() => el.focus());
  };

  const insertLink = () => {
    const el = textareaRef.current;
    if (!el) return;
    const url = window.prompt("Link URL");
    if (!url) return;
    const { selectionStart, selectionEnd } = el;
    const selected = value.slice(selectionStart, selectionEnd) || "link text";
    const markup = `[${selected}](${url})`;
    const next = value.slice(0, selectionStart) + markup + value.slice(selectionEnd);
    onChange(next.slice(0, DESCRIPTION_MAX_LENGTH));
  };

  return (
    <div>
      <span className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-ink-soft/70">
          Product Description<span className="text-red-600"> *</span>
        </span>
        <span className={`text-[11px] ${value.length >= DESCRIPTION_MAX_LENGTH ? "font-semibold text-amber-700" : "text-ink-soft/40"}`}>
          {value.length} / {DESCRIPTION_MAX_LENGTH} characters
        </span>
      </span>

      <div className="mt-1.5 flex items-center gap-1 rounded-t-md border border-b-0 border-stone-150 bg-stone-50 px-2 py-1.5">
        <button type="button" title="Bold" aria-label="Bold" disabled={disabled} onClick={() => applyWrap("**")} className="rounded p-1.5 text-ink-soft/60 hover:bg-stone-150 hover:text-ink disabled:cursor-not-allowed">
          <Bold className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button type="button" title="Italic" aria-label="Italic" disabled={disabled} onClick={() => applyWrap("*")} className="rounded p-1.5 text-ink-soft/60 hover:bg-stone-150 hover:text-ink disabled:cursor-not-allowed">
          <Italic className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <span className="mx-1 h-4 w-px bg-stone-200" />
        <button type="button" title="Bullet list" aria-label="Bullet list" disabled={disabled} onClick={() => applyLinePrefix("- ")} className="rounded p-1.5 text-ink-soft/60 hover:bg-stone-150 hover:text-ink disabled:cursor-not-allowed">
          <List className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button type="button" title="Link" aria-label="Link" disabled={disabled} onClick={insertLink} className="rounded p-1.5 text-ink-soft/60 hover:bg-stone-150 hover:text-ink disabled:cursor-not-allowed">
          <LinkIcon className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        disabled={disabled}
        maxLength={DESCRIPTION_MAX_LENGTH}
        onChange={(e) => onChange(e.target.value.slice(0, DESCRIPTION_MAX_LENGTH))}
        rows={6}
        className="w-full rounded-b-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 disabled:bg-stone-50"
      />
      <p className="mt-1 text-[11px] text-ink-soft/45">Supports **bold**, *italic*, - bullet lists, and [links](url).</p>
    </div>
  );
}
