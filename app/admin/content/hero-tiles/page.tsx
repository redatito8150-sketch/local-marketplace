import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getSiteContentRowForAdmin } from "@/lib/data/admin";
import { HOME_HERO_TILES } from "@/content/home";
import HeroTileForm from "@/components/admin/HeroTileForm";
import type { HomeHeroTilesContent } from "@/types";

const TILE_LABELS: Record<keyof HomeHeroTilesContent, string> = {
  women: "Women",
  men: "Men",
  kids: "Kids",
  home: "Home",
};

export default async function AdminHeroTilesPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const row = await getSiteContentRowForAdmin("home_hero_tiles");
  const overrides = (row?.value as Partial<HomeHeroTilesContent>) ?? {};

  return (
    <div>
      <Link href="/admin/content" className="text-[13px] font-medium text-ink-soft/60 hover:text-ink">
        ← Site Content
      </Link>
      <h1 className="mb-8 mt-3 text-2xl font-bold tracking-tightest text-ink">Homepage Hero Tiles</h1>

      <div className="space-y-6">
        {(Object.keys(TILE_LABELS) as (keyof HomeHeroTilesContent)[]).map((slug) => (
          <HeroTileForm
            key={slug}
            slug={slug}
            label={TILE_LABELS[slug]}
            initial={overrides[slug] ?? HOME_HERO_TILES[slug]}
          />
        ))}
      </div>
    </div>
  );
}
