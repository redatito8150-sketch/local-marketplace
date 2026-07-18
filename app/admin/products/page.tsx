import Link from "next/link";
import { Pencil } from "lucide-react";
import { getAllProductsForAdmin } from "@/lib/data/admin";
import { formatPrice } from "@/lib/format";
import DeleteEntityButton from "@/components/admin/DeleteEntityButton";

export default async function AdminProductsPage() {
  const products = await getAllProductsForAdmin();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tightest text-ink">
          Products ({products.length})
        </h1>
        <Link
          href="/admin/products/new"
          className="rounded-md bg-ink px-4 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02]"
        >
          Add product
        </Link>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl3 border border-stone-150 bg-white">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-stone-150 text-[12px] uppercase tracking-wide text-ink-soft/50">
            <tr>
              <th className="px-5 py-3 font-medium">Product</th>
              <th className="px-5 py-3 font-medium">Brand</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium">Price</th>
              <th className="px-5 py-3 font-medium">Stock</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-150">
            {products.map((product) => (
              <tr key={product.id}>
                <td className="flex items-center gap-3 px-5 py-3">
                  <div className="h-10 w-10 overflow-hidden rounded-md bg-stone-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <span className="font-medium text-ink">{product.name}</span>
                </td>
                <td className="px-5 py-3 text-ink-soft/70">{product.brandName}</td>
                <td className="px-5 py-3 capitalize text-ink-soft/70">
                  {product.category ?? "—"}
                </td>
                <td className="px-5 py-3 font-medium text-ink">
                  {formatPrice(product.price, product.currency)}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      product.inStock
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {product.inStock ? "In stock" : "Out of stock"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      aria-label={`Edit ${product.name}`}
                      className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-stone-100 hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" strokeWidth={1.6} />
                    </Link>
                    <DeleteEntityButton
                      apiPath={`/api/admin/products/${product.id}`}
                      name={product.name}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {products.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-soft/60">
            No products yet.
          </p>
        )}
      </div>
    </div>
  );
}
