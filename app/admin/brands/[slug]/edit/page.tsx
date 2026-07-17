import { notFound } from "next/navigation";
import { getAllBrandsForAdmin, getBrandForAdmin } from "@/lib/data/admin";
import BrandForm from "@/components/admin/BrandForm";

export default async function EditBrandPage({ params }: { params: { slug: string } }) {
  const [brand, allBrands] = await Promise.all([
    getBrandForAdmin(params.slug),
    getAllBrandsForAdmin(),
  ]);

  if (!brand) notFound();

  const otherBrands = allBrands.filter((b) => b.slug !== brand.slug);

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold tracking-tightest text-ink">Edit {brand.name}</h1>
      <BrandForm mode="edit" initial={brand} otherBrands={otherBrands} />
    </div>
  );
}
