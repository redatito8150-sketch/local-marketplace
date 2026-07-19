"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { AdminSearchResult } from "@/types";

const TYPE_LABELS: Record<AdminSearchResult["type"], string> = {
  product: "Product",
  brand: "Brand",
  order: "Order",
  user: "User",
};

export default function AdminQuickSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(query.trim())}`)
        .then((res) => res.json())
        .then((data) => setResults(data.results ?? []))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-md border border-stone-150 bg-stone-50 px-3 py-2">
        <Search className="h-4 w-4 text-ink-soft/50" strokeWidth={1.8} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search products, brands, orders, users…"
          className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-soft/40"
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-80 overflow-auto rounded-md border border-stone-150 bg-white shadow-card">
          {loading && <p className="px-3.5 py-3 text-[12.5px] text-ink-soft/50">Searching…</p>}
          {!loading && results.length === 0 && (
            <p className="px-3.5 py-3 text-[12.5px] text-ink-soft/50">No matches.</p>
          )}
          {!loading &&
            results.map((r, i) => (
              <Link
                key={`${r.type}-${i}`}
                href={r.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-3 border-b border-stone-100 px-3.5 py-2.5 text-[12.5px] last:border-b-0 hover:bg-stone-50"
              >
                <div>
                  <p className="font-medium text-ink">{r.label}</p>
                  {r.sublabel && <p className="text-[11.5px] text-ink-soft/50">{r.sublabel}</p>}
                </div>
                <span className="rounded-full bg-beige-100 px-2 py-0.5 text-[10.5px] font-semibold text-ink">
                  {TYPE_LABELS[r.type]}
                </span>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
