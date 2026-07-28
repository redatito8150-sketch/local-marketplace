import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function ProductBreadcrumb({
  mainCategory,
  productGroup,
  productTypeName,
  productName,
}: {
  mainCategory: string;
  productGroup: string;
  productTypeName: string;
  productName: string;
}) {
  const crumbs = [
    mainCategory && { label: mainCategory, href: `/shop/all?mainCategory=${encodeURIComponent(mainCategory)}` },
    productGroup && { label: productGroup, href: undefined },
    productTypeName && {
      label: productTypeName,
      href: `/shop/all?mainCategory=${encodeURIComponent(mainCategory)}&productType=${encodeURIComponent(productTypeName)}`,
    },
  ].filter((crumb): crumb is { label: string; href?: string } => Boolean(crumb));

  return (
    <nav
      aria-label="Breadcrumb"
      className="mx-auto max-w-screen2xl px-8 py-4 text-xs text-ink-soft/50 lg:px-12"
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/#home" className="transition-colors hover:text-ink">
            Home
          </Link>
        </li>
        {crumbs.map((crumb) => (
          <li key={crumb.label} className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3" strokeWidth={2} />
            {crumb.href ? (
              <Link href={crumb.href} className="transition-colors hover:text-ink">
                {crumb.label}
              </Link>
            ) : (
              <span>{crumb.label}</span>
            )}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3" strokeWidth={2} />
          <span className="text-ink-soft/70">{productName}</span>
        </li>
      </ol>
    </nav>
  );
}
