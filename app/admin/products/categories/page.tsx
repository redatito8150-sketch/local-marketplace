import { redirect } from "next/navigation";
import { requireStaffRole } from "@/lib/supabase/adminAuth";

export default async function AdminProductCategoriesPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");
  redirect("/admin/categories?view=structure");
}
