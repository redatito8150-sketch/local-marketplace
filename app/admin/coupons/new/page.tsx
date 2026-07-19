import { redirect } from "next/navigation";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import CouponForm from "@/components/admin/CouponForm";

export default async function NewCouponPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold tracking-tightest text-ink">Add coupon</h1>
      <CouponForm mode="create" />
    </div>
  );
}
