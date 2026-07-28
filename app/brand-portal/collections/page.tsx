import { redirect } from "next/navigation";
import CollectionManagementPanel from "@/components/brand-portal/CollectionManagementPanel";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";

export default async function BrandCollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const owner = await requireBrandOwner(brand);
  if (!owner?.brandId || !owner.brandSlug) redirect("/brand-portal");

  return (
    <section className="max-w-2xl rounded-xl3 border border-stone-150 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-ink">Collections</h1>
      <p className="mt-1 text-[13px] text-ink-soft/60">
        Create, rename, archive, restore, or safely delete reusable product collections.
      </p>
      <div className="mt-6">
        <CollectionManagementPanel
          brandId={owner.brandId}
          brandSlug={owner.brandSlug}
        />
      </div>
    </section>
  );
}
