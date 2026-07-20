import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getAuditLogsForBrand, getAllBrandsForAdmin } from "@/lib/data/admin";
import { describeAuditLog } from "@/lib/auditLogDescribe";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";

export default async function BrandPortalLogsPage({
  searchParams,
}: {
  searchParams: { brand?: string };
}) {
  const owner = await requireBrandOwner(searchParams.brand);
  if (!owner) redirect("/account");

  if (!owner.brandSlug) {
    const brands = await getAllBrandsForAdmin();
    return <BrandPicker brands={brands.map((b) => ({ slug: b.slug, name: b.name }))} />;
  }

  // Oversight is an owner-only concern — an assistant never sees this nav
  // item, and hitting the URL directly redirects away.
  if (owner.accessLevel !== "owner") redirect("/brand-portal");

  const logs = await getAuditLogsForBrand(owner.brandSlug);

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Logs ({logs.length})</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-soft/60">
        Every change made on {owner.brandName}&apos;s behalf — by you, your assistants, or the
        admin. Only entries logged after this feature shipped appear here.
      </p>

      <div className="mt-8 divide-y divide-stone-150 rounded-xl3 border border-stone-150 bg-white">
        {logs.map((log) => (
          <div key={log.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <span className="text-[13.5px] text-ink">{describeAuditLog(log)}</span>
            <span className="whitespace-nowrap text-[12px] text-ink-soft/50">
              {new Date(log.createdAt).toLocaleString("en-US")}
            </span>
          </div>
        ))}

        {logs.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-soft/60">
            No actions recorded yet for this brand.
          </p>
        )}
      </div>
    </div>
  );
}
