import Link from "next/link";
import { Search as SearchIcon } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { searchProductCards } from "@/lib/data/products";
import ProductTile from "@/components/shared/ProductTile";

export async function generateMetadata(
  props: {
    searchParams: Promise<{ q?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const q = searchParams.q ?? "";
  return {
    title: q ? `"${q}" — Search — Zakhnook` : "Search — Zakhnook",
    description: "Search Local's marketplace of independent local brands.",
  };
}

export default async function SearchPage(
  props: {
    searchParams: Promise<{ q?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const query = searchParams.q ?? "";
  const results = await searchProductCards(query);

  return (
    <main className="flex min-h-screen flex-col [&>*]:w-full bg-cream">
      <Header />

      <section className="mx-auto max-w-screen2xl px-8 py-12 lg:px-12 lg:py-16">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-soft/50">
          <SearchIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
          Search results
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tightest text-ink lg:text-4xl">
          {query ? `"${query}"` : "Search Local"}
        </h1>
        <p className="mt-2 text-sm text-ink-soft/60">
          {results.length} {results.length === 1 ? "result" : "results"}
        </p>

        {results.length === 0 ? (
          <div className="mt-16 flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-medium text-ink">No results found</p>
            <p className="mt-1.5 max-w-xs text-sm text-ink-soft/60">
              Try a different brand or product name, or explore our full catalog.
            </p>
            <Link
              href="/shop/women"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream transition-transform hover:scale-[1.03]"
            >
              Explore Products
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 lg:grid-cols-4">
            {results.map((result) => (
              <ProductTile key={result.id} product={result} nameClassName="text-[13px] font-semibold leading-snug" />
            ))}
          </div>
        )}
      </section>

      <Footer />
    </main>
  );
}
