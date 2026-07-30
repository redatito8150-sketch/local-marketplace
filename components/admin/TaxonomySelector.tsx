"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Check, Search } from "lucide-react";
import type { TaxonomyNode } from "@/types";

// A single searchable, drill-down picker for Main Category -> Product
// Group -> Product Type, replacing 3 separate <select> fields (which
// required opening a dropdown 3 times in sequence). Browsing a level
// (clicking a Main Category or Product Group to see its children) never
// calls onChange — only actually picking a Product Type (a leaf) does,
// so navigating around doesn't clear or flicker the current selection.
// Search matches across all 3 levels at once: typing a Product Type name
// finds it immediately without manually drilling down first.
export default function TaxonomySelector({
  nodes,
  value,
  onChange,
}: {
  nodes: TaxonomyNode[];
  value: string;
  onChange: (productTypeId: string) => void;
}) {
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedType = value ? byId.get(value) : undefined;
  const selectedGroup = selectedType ? byId.get(selectedType.parentId ?? "") : undefined;
  const selectedMain = selectedGroup ? byId.get(selectedGroup.parentId ?? "") : undefined;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Breadcrumb of drilled-into nodes: [] = showing Main Categories,
  // [main] = showing that Main's Product Groups, [main, group] = showing
  // that Group's Product Types.
  const [path, setPath] = useState<TaxonomyNode[]>([]);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const openPicker = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 320) });
    setSearch("");
    // Jump straight to the level containing the current selection, if any.
    setPath(selectedMain && selectedGroup ? [selectedMain, selectedGroup] : []);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const currentParentId = path.length > 0 ? path[path.length - 1].id : null;
  const currentLevel = path.length + 1; // 1, 2, or 3
  const visibleNodes = useMemo(
    () => nodes.filter((n) => n.level === currentLevel && (n.parentId ?? null) === currentParentId),
    [nodes, currentLevel, currentParentId]
  );

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return nodes
      .filter((n) => n.name.toLowerCase().includes(q))
      .slice(0, 40)
      .map((n) => {
        const group = n.level >= 2 ? byId.get(n.parentId ?? "") : undefined;
        const main = n.level === 3 ? byId.get(group?.parentId ?? "") : n.level === 2 ? byId.get(n.parentId ?? "") : undefined;
        const crumb = [main?.name, group?.name].filter(Boolean).join(" / ");
        return { node: n, crumb };
      });
  }, [nodes, search, byId]);

  const pick = (node: TaxonomyNode) => {
    if (node.level < 3) {
      setPath((p) => [...p.filter((n) => n.level < node.level), node]);
      setSearch("");
      return;
    }
    onChange(node.id);
    setOpen(false);
  };

  const goBack = () => setPath((p) => p.slice(0, -1));

  const fullPathSelected = Boolean(selectedMain && selectedGroup && selectedType);
  const backLabel = path.length === 1 ? "Back to All" : path.length === 2 ? `Back to ${path[0].name}` : null;

  return (
    <div>
      <span className="text-[12.5px] font-medium text-ink-soft/70">
        Category<span className="text-red-600"> *</span>
      </span>
      <button
        type="button"
        onClick={openPicker}
        className="mt-1.5 flex w-full items-center justify-between rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-left text-[14px] text-ink outline-none focus:border-ink/30"
      >
        <span className={fullPathSelected ? "text-ink" : "text-ink-soft/40"}>
          {fullPathSelected ? `${selectedMain!.name} / ${selectedGroup!.name} / ${selectedType!.name}` : "Select a category"}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 rotate-90 text-ink-soft/40" />
      </button>

      {open && coords && typeof document !== "undefined" && createPortal(
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 max-h-[400px] overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl"
            style={{ top: coords.top, left: coords.left, width: coords.width }}
          >
            <div className="flex items-center gap-2 border-b border-stone-150 px-3 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-ink-soft/40" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search categories"
                aria-label="Search categories"
                className="w-full text-[13.5px] text-ink outline-none placeholder:text-ink-soft/40"
              />
            </div>

            <div className="max-h-[340px] overflow-y-auto py-1">
              {searchResults ? (
                searchResults.length > 0 ? (
                  searchResults.map(({ node, crumb }) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => pick(node)}
                      className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-stone-50"
                    >
                      <span>
                        <span className={`block text-[13.5px] ${node.id === value ? "font-semibold text-ink" : "text-ink"}`}>{node.name}</span>
                        {crumb && <span className="block text-[11px] text-ink-soft/50">{crumb}</span>}
                      </span>
                      {node.id === value ? <Check className="h-4 w-4 shrink-0 text-ink" /> : node.level < 3 && <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft/30" />}
                    </button>
                  ))
                ) : (
                  <p className="px-3.5 py-4 text-center text-[12.5px] text-ink-soft/50">No categories match &quot;{search}&quot;.</p>
                )
              ) : (
                <>
                  {backLabel && (
                    <button type="button" onClick={goBack} className="flex w-full items-center gap-1.5 border-b border-stone-100 px-3.5 py-2 text-left text-[12.5px] font-medium text-ink-soft/60 hover:bg-stone-50">
                      <ChevronLeft className="h-3.5 w-3.5" />
                      {backLabel}
                    </button>
                  )}
                  {path.length > 0 && (
                    <p className="px-3.5 py-2 text-[12.5px] font-semibold text-ink-soft/70">{path[path.length - 1].name}</p>
                  )}
                  {visibleNodes.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => pick(node)}
                      aria-current={node.id === value ? "true" : undefined}
                      className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-[13.5px] hover:bg-stone-50 ${node.id === value ? "bg-stone-50 font-medium text-ink" : "text-ink"}`}
                    >
                      {node.name}
                      {node.id === value ? <Check className="h-4 w-4 shrink-0" /> : node.level < 3 && <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft/30" />}
                    </button>
                  ))}
                  {visibleNodes.length === 0 && (
                    <p className="px-3.5 py-4 text-center text-[12.5px] text-ink-soft/50">Nothing here yet.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
