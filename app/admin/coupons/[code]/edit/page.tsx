import { notFound, redirect } from "next/navigation";
import { getCouponForAdmin } from "@/lib/data/admin";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import CouponForm from "@/components/admin/CouponForm";

export default async function EditCouponPage({ params }: { params: { code: string } }) {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const coupon = await getCouponForAdmin(params.code);
  if (!coupon) notFound();

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold tracking-tightest text-ink">
        Edit {coupon.code}
      </h1>
      <CouponForm mode="edit" initial={coupon} />
    </div>
  );
}
