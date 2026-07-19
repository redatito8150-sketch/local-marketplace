import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getSiteContentRowForAdmin } from "@/lib/data/admin";
import { HOME_HERO } from "@/content/home";
import HeroCopyForm from "@/components/admin/HeroCopyForm";
import type { HomeHeroContent } from "@/types";

export default async function AdminHomeHeroPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const row = await getSiteContentRowForAdmin("home_hero");
  const initial = (row?.value as HomeHeroContent) ?? HOME_HERO;

  return (
    <div>
      <Link href="/admin/content" className="text-[13px] font-medium text-ink-soft/60 hover:text-ink">
        ← Site Content
      </Link>
      <h1 className="mb-8 mt-3 text-2xl font-bold tracking-tightest text-ink">Homepage Hero</h1>
      <HeroCopyForm apiKey="home_hero" initial={initial} maxHeadingLines={3} />
    </div>
  );
}
