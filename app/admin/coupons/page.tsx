import { redirect } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { getAllCouponsForAdmin } from "@/lib/data/admin";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import DeleteEntityButton from "@/components/admin/DeleteEntityButton";

export default async function AdminCouponsPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const coupons = await getAllCouponsForAdmin();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tightest text-ink">
          Coupons ({coupons.length})
        </h1>
        <Link
          href="/admin/coupons/new"
          className="rounded-md bg-ink px-4 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02]"
        >
          Add coupon
        </Link>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl3 border border-stone-150 bg-white">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-stone-150 text-[12px] uppercase tracking-wide text-ink-soft/50">
            <tr>
              <th className="px-5 py-3 font-medium">Code</th>
              <th className="px-5 py-3 font-medium">Discount</th>
              <th className="px-5 py-3 font-medium">Uses</th>
              <th className="px-5 py-3 font-medium">Expires</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-150">
            {coupons.map((coupon) => (
              <tr key={coupon.code}>
                <td className="px-5 py-3 font-medium text-ink">{coupon.code}</td>
                <td className="px-5 py-3 text-ink-soft/70">
                  {coupon.discountType === "percentage"
                    ? `${coupon.discountValue}%`
                    : `${coupon.discountValue} EGP`}
                </td>
                <td className="px-5 py-3 text-ink-soft/70">
                  {coupon.usedCount}
                  {coupon.maxUses ? ` / ${coupon.maxUses}` : ""}
                </td>
                <td className="px-5 py-3 text-ink-soft/70">
                  {coupon.expiresAt
                    ? new Date(coupon.expiresAt).toLocaleDateString("en-US")
                    : "Never"}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      coupon.active
                        ? "bg-green-50 text-green-700"
                        : "bg-stone-100 text-ink-soft/70"
                    }`}
                  >
                    {coupon.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/coupons/${coupon.code}/edit`}
                      aria-label={`Edit ${coupon.code}`}
                      className="rounded-md p-1.5 text-ink-soft/60 transition-colors hover:bg-stone-100 hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" strokeWidth={1.6} />
                    </Link>
                    <DeleteEntityButton
                      apiPath={`/api/admin/coupons/${coupon.code}`}
                      name={coupon.code}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {coupons.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-soft/60">No coupons yet.</p>
        )}
      </div>
    </div>
  );
}
