import Link from "next/link";
import { getAllProductsForAdmin } from "@/lib/data/admin";
import BulkProductActions from "@/components/admin/BulkProductActions";

export default async function AdminProductsPage() {
  const products = await getAllProductsForAdmin();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tightest text-ink">
          Products ({products.length})
        </h1>
        <div className="flex items-center gap-2">
          {/* A file download from an API route, not a page — next/link's
              prefetching/soft-navigation doesn't apply here. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/admin/products/export"
            className="rounded-md border border-stone-150 bg-white px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-stone-50"
          >
            Export CSV
          </a>
          <Link
            href="/admin/products/new"
            className="rounded-md bg-ink px-4 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02]"
          >
            Add product
          </Link>
        </div>
      </div>

      <BulkProductActions products={products} />
    </div>
  );
}
