import Image from "next/image";
import Link from "next/link";
import { getLowStockVariantsForAdmin } from "@/lib/data/admin";

export default async function AdminLowStockPage() {
  const variants = await getLowStockVariantsForAdmin();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">
        Low Stock ({variants.length})
      </h1>
      <p className="mt-1 text-sm text-ink-soft/60">
        Every variant at or below its low-stock threshold.
      </p>

      <div className="mt-8 overflow-x-auto rounded-xl3 border border-stone-150 bg-white">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-stone-150 text-[12px] uppercase tracking-wide text-ink-soft/50">
            <tr>
              <th className="px-5 py-3 font-medium">Product</th>
              <th className="px-5 py-3 font-medium">Variant</th>
              <th className="px-5 py-3 font-medium">Stock</th>
              <th className="px-5 py-3 font-medium">Threshold</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-150">
            {variants.map((v) => {
              const combo = [v.color, v.size].filter(Boolean).join(" / ") || "Default";
              return (
                <tr key={v.variantId}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-10 w-10 flex-none overflow-hidden rounded-md bg-stone-100">
                        <Image src={v.image} alt={v.productName} fill className="object-cover" />
                      </div>
                      <div>
                        <p className="font-medium text-ink">{v.productName}</p>
                        <p className="text-[12px] text-ink-soft/50">{v.brandName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-ink-soft/70">{combo}</td>
                  <td className="px-5 py-3 font-semibold text-red-600">{v.quantity}</td>
                  <td className="px-5 py-3 text-ink-soft/70">{v.lowStockThreshold}</td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/products/${v.productId}/edit`}
                      className="text-[12.5px] font-medium text-ink hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {variants.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-soft/60">
            Nothing is low on stock right now.
          </p>
        )}
      </div>
    </div>
  );
}
