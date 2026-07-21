import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getSiteContentRowForAdmin } from "@/lib/data/admin";
import { SHOP_BY_MOOD } from "@/content/shopByMood";
import ShopByMoodForm from "@/components/admin/ShopByMoodForm";
import type { MoodTileContent } from "@/types";

export default async function AdminShopByMoodPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const row = await getSiteContentRowForAdmin("shop_by_mood");
  const initial = (row?.value as MoodTileContent[]) ?? SHOP_BY_MOOD;

  return (
    <div>
      <Link href="/admin/content" className="text-[13px] font-medium text-ink-soft/60 hover:text-ink">
        ← Site Content
      </Link>
      <h1 className="mb-8 mt-3 text-2xl font-bold tracking-tightest text-ink">Shop by Mood</h1>
      <ShopByMoodForm initial={initial} />
    </div>
  );
}
