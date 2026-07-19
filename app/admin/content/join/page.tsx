import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getSiteContentRowForAdmin } from "@/lib/data/admin";
import { JOIN_HERO } from "@/content/join";
import HeroCopyForm from "@/components/admin/HeroCopyForm";
import type { JoinHeroContent } from "@/types";

export default async function AdminJoinHeroPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const row = await getSiteContentRowForAdmin("join_hero");
  const initial =
    (row?.value as JoinHeroContent) ??
    ({
      label: JOIN_HERO.label,
      headingLines: JOIN_HERO.headingLines,
      subheading: JOIN_HERO.subheading,
      ctaLabel: JOIN_HERO.ctaLabel,
    } satisfies JoinHeroContent);

  return (
    <div>
      <Link href="/admin/content" className="text-[13px] font-medium text-ink-soft/60 hover:text-ink">
        ← Site Content
      </Link>
      <h1 className="mb-8 mt-3 text-2xl font-bold tracking-tightest text-ink">Join as a Brand</h1>
      <HeroCopyForm apiKey="join_hero" initial={initial} hasLabel maxHeadingLines={3} />
    </div>
  );
}
