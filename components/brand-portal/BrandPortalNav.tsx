"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, FileEdit, History, LayoutDashboard, Package, ShoppingBag, ShoppingCart } from "lucide-react";

const GROUPS = [
  { items: [{ label: "Overview", href: "/brand-portal", icon: LayoutDashboard }] },
  {
    label: "Catalog",
    items: [
      { label: "Products", href: "/brand-portal/products", icon: ShoppingCart },
      { label: "Inventory", href: "/brand-portal/stock", icon: Package },
    ],
  },
  { label: "Sales", items: [{ label: "Orders", href: "/brand-portal/orders", icon: ShoppingBag }] },
];

export default function BrandPortalNav({ showPageContent = true }: { showPageContent?: boolean }) {
  const pathname = usePathname();
  const brand = useSearchParams().get("brand");
  const withBrand = (href: string) => (brand ? `${href}?brand=${brand}` : href);
  const groups = showPageContent
    ? [...GROUPS, { label: "Brand", items: [
        { label: "Brand Profile", href: "/brand-portal/page-content", icon: FileEdit },
        { label: "Activity", href: "/brand-portal/logs", icon: History },
      ] }]
    : GROUPS;
  const allItems = groups.flatMap((group) => group.items);
  const activeHref = allItems
    .filter((item) => item.href === "/brand-portal" ? pathname === "/brand-portal" : pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label="Brand portal navigation" className="space-y-6">
      {groups.map((group, index) => (
        <div key={group.label ?? index}>
          {group.label && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#a29489]">{group.label}</p>}
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = activeHref === item.href;
              return (
                <Link
                  key={item.href}
                  href={withBrand(item.href)}
                  aria-current={active ? "page" : undefined}
                  className={`group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 ${active ? "bg-[#3b332d] text-white shadow-sm" : "text-[#75685f] hover:bg-[#f1eae2] hover:text-[#302b27]"}`}
                >
                  <item.icon className={`h-[17px] w-[17px] ${active ? "text-white" : "text-[#a29489] group-hover:text-[#574b43]"}`} strokeWidth={1.8} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <div className="border-t border-[#e3dcd3] pt-4">
        <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-[#75685f] hover:bg-[#f1eae2] hover:text-[#302b27]">
          <ArrowLeft className="h-[17px] w-[17px] text-[#a29489]" /> Storefront
        </Link>
      </div>
    </nav>
  );
}
