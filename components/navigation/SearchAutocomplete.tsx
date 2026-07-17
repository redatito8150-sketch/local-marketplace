"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { searchProducts, SearchResult } from "@/lib/data/products";
import { formatPrice } from "@/lib/format";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;
const SUGGESTION_LIMIT = 6;

export default function SearchAutocomplete() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Debounced live search as the person types
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchProducts(trimmed, SUGGESTION_LIMIT);
        setSuggestions(results);
        setActiveIndex(-1);
      } catch (err) {
        console.error("Search suggestions failed:", err);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const goToFullSearch = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      setOpen(false);
      router.push(suggestions[activeIndex].href);
      return;
    }
    goToFullSearch(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    }
  };

  const showDropdown = open && query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <div ref={containerRef} className="relative hidden md:block">
      <form onSubmit={handleSubmit} role="search">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/60" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search for products, brands..."
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls="search-suggestions"
          autoComplete="off"
          className="w-64 rounded-full border border-stone-150 bg-white/70 py-2.5 pl-11 pr-9 text-sm text-ink placeholder:text-ink-soft/50 outline-none transition-all focus:w-80 focus:border-ink/30 focus:bg-white"
        />
        {loading && (
          <Loader2 className="absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-ink-soft/40" />
        )}
      </form>

      {showDropdown && (
        <div
          id="search-suggestions"
          role="listbox"
          className="absolute left-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-stone-150 bg-white shadow-card"
        >
          {suggestions.length > 0 ? (
            <>
              <ul className="max-h-96 overflow-y-auto py-2">
                {suggestions.map((item, i) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                        activeIndex === i ? "bg-stone-50" : "hover:bg-stone-50"
                      }`}
                    >
                      <span className="relative h-11 w-11 flex-none overflow-hidden rounded-lg bg-beige-50">
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          sizes="44px"
                          className="object-cover"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">
                          {item.name}
                        </span>
                        <span className="block truncate text-[11px] uppercase tracking-wide text-ink-soft/50">
                          {item.brand}
                        </span>
                      </span>
                      <span className="flex-none text-[13px] font-semibold text-ink">
                        {formatPrice(item.price, item.currency)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => goToFullSearch(query)}
                className="block w-full border-t border-stone-150 px-4 py-3 text-center text-[13px] font-semibold text-ink transition-colors hover:bg-stone-50"
              >
                See all results for &ldquo;{query.trim()}&rdquo;
              </button>
            </>
          ) : !loading ? (
            <div className="px-4 py-6 text-center text-[13px] text-ink-soft/50">
              No matches for &ldquo;{query.trim()}&rdquo;
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-[13px] text-ink-soft/40">
              Searching...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
