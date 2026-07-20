import Image from "next/image";
import { getAllProductsForAdmin } from "@/lib/data/admin";
import { formatPrice } from "@/lib/format";
import ReviewDecisionActions from "@/components/admin/ReviewDecisionActions";
import DeletionReviewActions from "@/components/admin/DeletionReviewActions";
import type { ProductRecord } from "@/types";

interface ProposedEditFields {
  name: string;
  price: number;
  compareAtPrice?: number;
  currency: "USD" | "EGP";
  image: string;
  description: string;
}

// Only surfaces fields that actually changed — the brand-portal edit form
// always resubmits every field, so a raw dump would bury the real change
// under a wall of identical rows.
function diffFields(existing: ProductRecord, proposed: ProposedEditFields) {
  const rows: { label: string; before: string; after: string }[] = [];
  const push = (label: string, before: string, after: string) => {
    if (before !== after) rows.push({ label, before, after });
  };

  push("Name", existing.name, proposed.name);
  push(
    "Price",
    formatPrice(existing.price, existing.currency),
    formatPrice(proposed.price, proposed.currency)
  );
  push(
    "Compare At Price",
    existing.compareAtPrice ? formatPrice(existing.compareAtPrice, existing.currency) : "—",
    proposed.compareAtPrice ? formatPrice(proposed.compareAtPrice, proposed.currency) : "—"
  );
  push("Description", existing.description, proposed.description);
  push("Main Image", existing.image, proposed.image);

  return rows;
}

export default async function AdminProductReviewPage() {
  const products = await getAllProductsForAdmin();

  const newSubmissions = products.filter(
    (p) => p.status === "pending_review" && !p.pendingChanges
  );
  const pendingEdits = products.filter((p) => p.status === "published" && p.pendingChanges);
  const deletionRequests = products.filter((p) => Boolean(p.deletionRequestedAt));

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tightest text-ink">Product Review Queue</h1>
        <p className="mt-1.5 text-[13.5px] text-ink-soft/60">
          Every product a brand submits, edits, or asks to delete lands here first — nothing
          reaches the storefront without a decision below.
        </p>
      </div>

      <ReviewSection
        title="New Submissions"
        count={newSubmissions.length}
        emptyLabel="No new products waiting for review."
      >
        {newSubmissions.map((product) => (
          <div key={product.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <ProductSummary product={product} />
            <ReviewDecisionActions productId={product.id} />
          </div>
        ))}
      </ReviewSection>

      <ReviewSection
        title="Pending Edits"
        count={pendingEdits.length}
        emptyLabel="No pending edits to review."
      >
        {pendingEdits.map((product) => {
          const proposed = product.pendingChanges as unknown as ProposedEditFields;
          const diffs = diffFields(product, proposed);
          return (
            <div key={product.id} className="flex flex-col gap-3 px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <ProductSummary product={product} />
                <ReviewDecisionActions productId={product.id} />
              </div>
              {diffs.length > 0 ? (
                <div className="overflow-hidden rounded-md border border-stone-150">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-ink-soft/50">
                      <tr>
                        <th className="px-3 py-2 font-medium">Field</th>
                        <th className="px-3 py-2 font-medium">Current (live)</th>
                        <th className="px-3 py-2 font-medium">Proposed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-150">
                      {diffs.map((d) => (
                        <tr key={d.label}>
                          <td className="px-3 py-2 font-medium text-ink-soft/70">{d.label}</td>
                          <td className="px-3 py-2 text-ink-soft/50 line-through decoration-red-300">
                            {d.before}
                          </td>
                          <td className="px-3 py-2 text-ink">{d.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[12px] text-ink-soft/50">
                  No changes to the fields shown here — the edit may only touch stock, sizes, or
                  gallery images. Open the product on the storefront to compare in full.
                </p>
              )}
            </div>
          );
        })}
      </ReviewSection>

      <ReviewSection
        title="Deletion Requests"
        count={deletionRequests.length}
        emptyLabel="No deletion requests pending."
      >
        {deletionRequests.map((product) => (
          <div key={product.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <ProductSummary product={product} />
            <DeletionReviewActions productId={product.id} name={product.name} />
          </div>
        ))}
      </ReviewSection>
    </div>
  );
}

function ReviewSection({
  title,
  count,
  emptyLabel,
  children,
}: {
  title: string;
  count: number;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[15px] font-semibold text-ink">
        {title} <span className="text-ink-soft/50">({count})</span>
      </h2>
      <div className="mt-3 overflow-hidden rounded-xl3 border border-stone-150 bg-white">
        {count === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-soft/60">{emptyLabel}</p>
        ) : (
          <div className="divide-y divide-stone-150">{children}</div>
        )}
      </div>
    </section>
  );
}

function ProductSummary({ product }: { product: ProductRecord }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-12 w-12 flex-none overflow-hidden rounded-md bg-stone-100">
        <Image src={product.image} alt={product.name} fill className="object-cover" />
      </div>
      <div>
        <p className="font-medium text-ink">{product.name}</p>
        <p className="text-[12.5px] text-ink-soft/60">
          {product.brandName} · {formatPrice(product.price, product.currency)}
        </p>
      </div>
    </div>
  );
}
