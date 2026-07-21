import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getSiteContentRowForAdmin } from "@/lib/data/admin";
import { HOME_NEW_ARRIVALS } from "@/content/home";
import HomeProductSectionForm from "@/components/admin/HomeProductSectionForm";
import type { HomeProductSectionContent } from "@/types";

export default async function AdminNewArrivalsPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const row = await getSiteContentRowForAdmin("home_new_arrivals");
  const initial = (row?.value as HomeProductSectionContent) ?? HOME_NEW_ARRIVALS;

  return (
    <div>
      <Link href="/admin/content" className="text-[13px] font-medium text-ink-soft/60 hover:text-ink">
        ← Site Content
      </Link>
      <h1 className="mb-8 mt-3 text-2xl font-bold tracking-tightest text-ink">
        New Arrivals Section
      </h1>
      <HomeProductSectionForm initial={initial} />
    </div>
  );
}
