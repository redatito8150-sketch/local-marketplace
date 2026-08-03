import { redirect } from "next/navigation";
import { BrandEditProvider } from "@/components/brand/BrandEditContext";
import CollectionsManager from "@/components/brand/CollectionsManager";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";

// The one place a brand creates/edits/deletes a collection (cover photos,
// name, tag, description, product membership, pause, scheduling) — see
// components/brand/CollectionsManager, which used to also render (in a
// lighter form) directly on the public brand profile page. That page now
// only reorders what's already here (components/brand/
// CollectionsOrderPanel), closing the "3 disconnected places to create a
// collection" gap. CollectionsManager reads canEdit from
// BrandEditProvider the same way it does on the public page — wrapping it
// here reuses that exact same check rather than re-deriving it.
export default async function BrandCollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const owner = await requireBrandOwner(brand);
  if (!owner?.brandId || !owner.brandSlug) redirect("/brand-portal");

  return (
    <section className="max-w-3xl rounded-xl3 border border-stone-150 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-ink">Collections</h1>
      <p className="mt-1 text-[13px] text-ink-soft/60">
        Create, edit, and manage your collections here — cover photos, name, tag, description, which products belong
        in each, pausing, and scheduling a future reveal. Their display order on your public profile is set from
        there instead.
      </p>
      <div className="mt-6">
        <BrandEditProvider brandSlug={owner.brandSlug}>
          <CollectionsManager brandSlug={owner.brandSlug} />
        </BrandEditProvider>
      </div>
    </section>
  );
}
