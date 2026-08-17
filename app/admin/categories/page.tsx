import Link from "next/link";
import { redirect } from "next/navigation";
import { ImageIcon, Network } from "lucide-react";
import CategoryHeroForm from "@/components/admin/CategoryHeroForm";
import ProductTaxonomyForm from "@/components/admin/ProductTaxonomyForm";
import TaxonomyTreeView from "@/components/admin/TaxonomyTreeView";
import { DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import { CATEGORIES } from "@/content/categories";
import { DEFAULT_PRODUCT_TAXONOMY } from "@/content/productTaxonomy";
import { getFullTaxonomyTreeForAdmin, getSiteContentRowForAdmin } from "@/lib/data/admin";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { getUserPermissions } from "@/lib/supabase/permissions";
import type { CategoryHeroContent, CategorySlug, ProductTaxonomyContent } from "@/types";

type CategoryView = "structure" | "storefront";

const CATEGORY_LABELS: Record<CategorySlug, string> = {
  women: "Women",
  men: "Men",
  kids: "Kids",
};

export default async function AdminCategoriesPage(props: {
  searchParams: Promise<{ view?: string }>;
}) {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  const permissions = await getUserPermissions(staff.user.id);
  const canManageStorefront = permissions.has("manage_site_content");
  const requestedView = (await props.searchParams).view;
  const view: CategoryView = requestedView === "storefront" && canManageStorefront ? "storefront" : "structure";

  const structureData = view === "structure"
    ? await Promise.all([
        getSiteContentRowForAdmin("product_taxonomy"),
        getFullTaxonomyTreeForAdmin(),
      ])
    : null;
  const heroRow = view === "storefront" ? await getSiteContentRowForAdmin("category_heroes") : null;

  const taxonomy = (structureData?.[0]?.value as ProductTaxonomyContent | undefined) ?? DEFAULT_PRODUCT_TAXONOMY;
  const taxonomyNodes = structureData?.[1] ?? [];
  const heroOverrides: Partial<Record<CategorySlug, CategoryHeroContent>> =
    (heroRow?.value as Record<CategorySlug, CategoryHeroContent> | undefined) ?? {};

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Catalog system"
        title="Categories"
        description="Manage the product hierarchy and the storefront presentation of each category from one workspace."
      />

      <nav aria-label="Category workspace" className="mt-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-1">
        <CategoryTab href="/admin/categories?view=structure" label="Product structure" icon={Network} active={view === "structure"} />
        {canManageStorefront ? <CategoryTab href="/admin/categories?view=storefront" label="Storefront heroes" icon={ImageIcon} active={view === "storefront"} /> : null}
      </nav>

      {view === "structure" ? (
        <div className="mt-6 space-y-6">
          <DashboardPanel
            title="Product structure"
            description="The fixed Main Category → Product Group → Product Type hierarchy used by product creation and catalog filters."
          >
            <div className="p-5 sm:p-6">
              <TaxonomyTreeView nodes={taxonomyNodes} />
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="Reusable product attributes"
            description="Materials and fits remain editable here. Brand-owned collections stay inside each brand workspace."
          >
            <div className="p-5 sm:p-6">
              <ProductTaxonomyForm initial={taxonomy} />
            </div>
          </DashboardPanel>
        </div>
      ) : (
        <DashboardPanel
          className="mt-6"
          title="Storefront heroes"
          description="Control the headline, image and call to action customers see on Women, Men and Kids category pages."
        >
          <div className="grid gap-5 p-5 lg:grid-cols-2 2xl:grid-cols-3 sm:p-6">
            {(["women", "men", "kids"] as CategorySlug[]).map((slug) => (
              <CategoryHeroForm
                key={slug}
                slug={slug}
                label={CATEGORY_LABELS[slug]}
                initial={heroOverrides[slug] ?? CATEGORIES[slug].hero}
              />
            ))}
          </div>
        </DashboardPanel>
      )}
    </div>
  );
}

function CategoryTab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-[12.5px] font-semibold transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]/25 ${active ? "bg-[var(--admin-selected)] text-[var(--admin-primary)] shadow-[0_1px_3px_rgba(67,45,29,0.08)]" : "text-[var(--admin-text-muted)] hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text)]"}`}
    >
      <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
      {label}
    </Link>
  );
}
