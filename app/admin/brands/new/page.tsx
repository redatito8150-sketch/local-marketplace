import { notFound } from "next/navigation";
import { getApplicationForAdmin } from "@/lib/data/admin";
import BrandForm, { type FormState } from "@/components/admin/BrandForm";

function prefillFromApplication(application: NonNullable<Awaited<ReturnType<typeof getApplicationForAdmin>>>): Partial<FormState> {
  const rebuilt = application.applicationData;
  return {
    name: rebuilt?.brandName || application.brandNameEn || application.brandName,
    category: rebuilt?.primaryCategory || application.productCategory,
    foundedYear: rebuilt?.foundedYear
      ? String(rebuilt.foundedYear)
      : application.foundingYear
        ? String(application.foundingYear)
        : "",
    city: rebuilt?.city ?? application.city ?? "Cairo",
    isActive: false,
  };
}

export default async function NewBrandPage(props: { searchParams: Promise<{ applicationId?: string }> }) {
  const searchParams = await props.searchParams;

  let prefill: Partial<FormState> | undefined;
  let sourceApplicationId: string | undefined;
  let bannerBrandName: string | undefined;

  if (searchParams.applicationId) {
    const application = await getApplicationForAdmin(searchParams.applicationId);
    if (!application) notFound();
    if (
      (application.status !== "approved" && application.status !== "approved_pending_creation") ||
      application.approvedBrandId
    ) {
      notFound();
    }
    prefill = prefillFromApplication(application);
    sourceApplicationId = application.id;
    bannerBrandName = application.brandName;
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold tracking-tightest text-ink">Add brand</h1>
      {bannerBrandName && (
        <p className="mb-6 rounded-md bg-emerald-50 px-3.5 py-2.5 text-[13px] font-medium text-emerald-700">
          Pre-filled from the approved application for &quot;{bannerBrandName}&quot;. Review every
          field — the slug still needs to be filled in manually — then create the brand to mark
          the application converted.
        </p>
      )}
      <BrandForm
        mode="create"
        prefill={prefill}
        sourceApplicationId={sourceApplicationId}
      />
    </div>
  );
}
