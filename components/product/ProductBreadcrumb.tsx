import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function ProductBreadcrumb({
  categoryLabel,
  categoryHref,
  productName,
}: {
  categoryLabel: string;
  categoryHref: string;
  productName: string;
}) {
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
        <li className="flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3" strokeWidth={2} />
          <Link href={categoryHref} className="transition-colors hover:text-ink">
            {categoryLabel}
          </Link>
        </li>
        <li className="flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3" strokeWidth={2} />
          <span className="text-ink-soft/70">{productName}</span>
        </li>
      </ol>
    </nav>
  );
}
