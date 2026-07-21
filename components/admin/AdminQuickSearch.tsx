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
      // Clearing stale results when the query shrinks below the minimum
      // length — tied to the debounced fetch below, not derivable at
      // render time.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <div ref={containerRef} className="relative w-full">
      <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-slate-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-100">
        <Search className="h-4 w-4 text-slate-400" strokeWidth={1.8} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search products, brands, orders, users…"
          className="w-full bg-transparent text-[12.5px] text-slate-800 outline-none placeholder:text-slate-400"
        />
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl">
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
