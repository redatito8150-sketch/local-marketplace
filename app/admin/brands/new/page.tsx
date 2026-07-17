import { getAllBrandsForAdmin } from "@/lib/data/admin";
import BrandForm from "@/components/admin/BrandForm";

export default async function NewBrandPage() {
  const otherBrands = await getAllBrandsForAdmin();

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold tracking-tightest text-ink">Add brand</h1>
      <BrandForm mode="create" otherBrands={otherBrands} />
    </div>
  );
}
