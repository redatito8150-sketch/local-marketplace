import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getSiteContentRowForAdmin } from "@/lib/data/admin";
import { CATEGORIES } from "@/content/categories";
import CategoryHeroForm from "@/components/admin/CategoryHeroForm";
import type { CategoryHeroContent, CategorySlug } from "@/types";

const CATEGORY_LABELS: Record<CategorySlug, string> = {
  women: "Women",
  men: "Men",
  kids: "Kids",
};

export default async function AdminCategoryHeroesPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const row = await getSiteContentRowForAdmin("category_heroes");
  const overrides = (row?.value as Record<CategorySlug, CategoryHeroContent>) ?? {};

  return (
    <div>
      <Link href="/admin/content" className="text-[13px] font-medium text-ink-soft/60 hover:text-ink">
        ← Site Content
      </Link>
      <h1 className="mb-8 mt-3 text-2xl font-bold tracking-tightest text-ink">Category Heroes</h1>

      <div className="space-y-6">
        {(["women", "men", "kids"] as CategorySlug[]).map((slug) => (
          <CategoryHeroForm
            key={slug}
            slug={slug}
            label={CATEGORY_LABELS[slug]}
            initial={overrides[slug] ?? CATEGORIES[slug].hero}
          />
        ))}
      </div>
    </div>
  );
}
