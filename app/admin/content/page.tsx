import { redirect } from "next/navigation";
import Link from "next/link";
import { Home, LayoutGrid, Newspaper, Store, GalleryHorizontal } from "lucide-react";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getSiteContentRowForAdmin } from "@/lib/data/admin";

const SECTIONS = [
  {
    key: "home_hero",
    href: "/admin/content/hero",
    icon: Home,
    title: "Homepage Hero",
    description: "The headline, subheading, and button on the homepage.",
  },
  {
    key: "category_heroes",
    href: "/admin/content/categories",
    icon: LayoutGrid,
    title: "Category Heroes",
    description: "The banner text and image at the top of Women/Men/Kids.",
  },
  {
    key: "home_hero_tiles",
    href: "/admin/content/hero-tiles",
    icon: GalleryHorizontal,
    title: "Homepage Hero Tiles",
    description: "The 4 image tiles (Women/Men/Kids/Home) on the homepage.",
  },
  {
    key: "journal_articles",
    href: "/admin/content/journal",
    icon: Newspaper,
    title: "Journal Articles",
    description: "Add, edit, or remove stories in the Journal.",
  },
  {
    key: "join_hero",
    href: "/admin/content/join",
    icon: Store,
    title: "Join as a Brand",
    description: "The hero headline and subheading on the brand signup page.",
  },
] as const;

export default async function AdminContentPage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const rows = await Promise.all(
    SECTIONS.map((s) => getSiteContentRowForAdmin(s.key))
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Site Content</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-soft/60">
        Edit marketing copy directly — changes go live immediately, no code
        or deploy needed. The mega menu and product categories stay
        code-managed.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map((section, i) => {
          const row = rows[i];
          return (
            <Link
              key={section.key}
              href={section.href}
              className="rounded-xl3 border border-stone-150 bg-white p-5 transition-colors hover:border-ink/20"
            >
              <div className="flex items-start justify-between">
                <section.icon className="h-5 w-5 text-ink-soft/60" strokeWidth={1.6} />
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    row
                      ? "bg-green-50 text-green-700"
                      : "bg-stone-100 text-ink-soft/60"
                  }`}
                >
                  {row ? "Customized" : "Default"}
                </span>
              </div>
              <h2 className="mt-3 text-[15px] font-semibold text-ink">{section.title}</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft/60">
                {section.description}
              </p>
              {row && (
                <p className="mt-3 text-[11.5px] text-ink-soft/45">
                  Last edited {new Date(row.updatedAt).toLocaleString("en-US")}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
