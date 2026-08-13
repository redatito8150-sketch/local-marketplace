import { redirect } from "next/navigation";
import { BrandEditProvider } from "@/components/brand/BrandEditContext";
import CollectionsStudio from "@/components/brand/CollectionsStudio";
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
    <section className="max-w-5xl">
      <BrandEditProvider brandSlug={owner.brandSlug}>
        <CollectionsStudio brandSlug={owner.brandSlug} />
      </BrandEditProvider>
    </section>
  );
}
