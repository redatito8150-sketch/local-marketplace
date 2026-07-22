"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import CatalogControls, { CatalogEmptyState } from "@/components/category/CatalogControls";
import ProductGrid from "@/components/category/ProductGrid";
import type { FilterGroup, Product, SortOption, ViewMode } from "@/types";
import { CATALOG_FILTER_QUERY_KEYS } from "@/lib/catalogQuery";

export default function AllProductsShoppingArea({ products, filterGroups, productTypeRelations, selected: initialSelected, sort: initialSort, search: initialSearch, total, page, totalPages }: { products: Product[]; filterGroups: FilterGroup[]; productTypeRelations: { productCategory?: string; productType?: string }[]; selected: Record<string, string[]>; sort: SortOption; search: string; total: number; page: number; totalPages: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState(initialSelected);
  const selectedRef = useRef(initialSelected);
  const [sort, setSort] = useState(initialSort);
  const [search, setSearch] = useState(initialSearch);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const navigate = (nextSelected: Record<string, string[]>, nextSort = sort, nextSearch = initialSearch, nextPage = 1) => {
    const params = new URLSearchParams(searchParams.toString());
    CATALOG_FILTER_QUERY_KEYS.forEach((key) => params.delete(key));
    Object.entries(nextSelected).forEach(([key, values]) => { if (values.length) params.set(key, values.join(",")); });
    if (nextSort === "newest") params.delete("sort"); else params.set("sort", nextSort);
    if (nextSearch.trim()) params.set("q", nextSearch.trim()); else params.delete("q");
    if (nextPage > 1) params.set("page", String(nextPage)); else params.delete("page");
    router.push(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  };

  const toggleFilter = (groupId: string, optionId: string) => {
    const current = selectedRef.current;
    const values = current[groupId] ?? [];
    const nextValues = values.includes(optionId) ? values.filter((value) => value !== optionId) : [...values, optionId];
    const next = { ...current, [groupId]: nextValues };
    selectedRef.current = next;
    setSelected(next);
    navigate(next);
  };
  const clearFilters = () => { selectedRef.current = {}; setSelected({}); navigate({}); };
  const changeSort = (next: SortOption) => { setSort(next); navigate(selected, next); };
  const submitSearch = (event: FormEvent) => { event.preventDefault(); navigate(selected, sort, search); };

  return (
    <section className="mx-auto max-w-[1680px] px-5 pb-20 pt-8 sm:px-8 lg:px-[60px]">
      <div className="mb-7 flex flex-col gap-5 border-b border-stone-150 pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div><nav aria-label="Breadcrumb" className="text-[11px] text-ink-soft/55"><Link href="/">Home</Link> <span aria-hidden> / </span> Shop All</nav><h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight text-ink sm:text-5xl">Explore All Products</h1><p className="mt-2 text-[13px] text-ink-soft/65">Discover {total.toLocaleString("en-US")} active products from independent local brands.</p></div>
        <form onSubmit={submitSearch} role="search" className="flex h-11 w-full max-w-md items-center rounded-full border border-stone-150 bg-white px-4 focus-within:border-ink/30"><Search className="h-4 w-4 text-ink-soft/45" /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search all products" placeholder="Search products or brands" className="min-w-0 flex-1 bg-transparent px-3 text-[13px] outline-none" />{search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); navigate(selected, sort, ""); }}><X className="h-4 w-4 text-ink-soft/45" /></button>}</form>
      </div>

      <CatalogControls groups={filterGroups} products={products} productTypeRelations={productTypeRelations} selected={selected} onToggle={toggleFilter} onClear={clearFilters} productCount={total} viewMode={viewMode} onViewModeChange={setViewMode} sort={sort} onSortChange={changeSort} />

      <div className="mt-6">{products.length ? <ProductGrid products={products} viewMode={viewMode} compact /> : <CatalogEmptyState onClear={() => { setSearch(""); selectedRef.current = {}; setSelected({}); navigate({}, sort, ""); }} />}</div>

      {totalPages > 1 && <nav aria-label="Catalog pages" className="mt-10 flex flex-wrap items-center justify-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => navigate(selected, sort, initialSearch, page - 1)} className="min-h-10 rounded-full border border-stone-150 bg-white px-4 text-[12px] font-semibold disabled:opacity-35">Previous</button>
        {Array.from({ length: totalPages }, (_, index) => index + 1).filter((value) => value === 1 || value === totalPages || Math.abs(value - page) <= 2).map((value, index, values) => <span key={value} className="contents">{index > 0 && value - values[index - 1] > 1 && <span className="px-1 text-ink-soft/45">…</span>}<button type="button" aria-current={value === page ? "page" : undefined} onClick={() => navigate(selected, sort, initialSearch, value)} className={`h-10 min-w-10 rounded-full border px-3 text-[12px] font-bold ${value === page ? "border-mahalyred bg-mahalyred text-white" : "border-stone-150 bg-white text-ink"}`}>{value}</button></span>)}
        <button type="button" disabled={page >= totalPages} onClick={() => navigate(selected, sort, initialSearch, page + 1)} className="min-h-10 rounded-full border border-stone-150 bg-white px-4 text-[12px] font-semibold disabled:opacity-35">Next</button>
      </nav>}
    </section>
  );
}
