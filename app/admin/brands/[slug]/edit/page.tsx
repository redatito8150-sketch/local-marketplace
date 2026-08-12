import { notFound } from "next/navigation";
import { getBrandForAdmin, getBrandMembersForAdmin } from "@/lib/data/admin";
import BrandForm from "@/components/admin/BrandForm";
import LinkBrandOwnerField from "@/components/admin/LinkBrandOwnerField";

export default async function EditBrandPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const [brand, members] = await Promise.all([
    getBrandForAdmin(params.slug),
    getBrandMembersForAdmin(params.slug),
  ]);

  if (!brand) notFound();

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold tracking-tightest text-ink">Edit {brand.name}</h1>

      <div className="mb-8 max-w-lg rounded-xl3 border border-stone-150 bg-white p-5">
        <h2 className="text-[13.5px] font-semibold text-ink">Brand Portal Access</h2>
        <p className="mt-1 text-[12px] text-ink-soft/50">
          Link an existing account so this brand can log in and see their own orders and stock.
        </p>
        <div className="mt-3">
          <LinkBrandOwnerField brandSlug={brand.slug} owners={members?.owners ?? []} />
        </div>
      </div>

      <BrandForm mode="edit" initial={brand} />
    </div>
  );
}
