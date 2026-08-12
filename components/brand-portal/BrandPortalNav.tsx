"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FileEdit, FolderKanban, History, House, LayoutDashboard, MessageSquare, Package, ShoppingBag, ShoppingCart, Warehouse } from "lucide-react";
import { useDashboardSidebar } from "@/components/dashboard/DashboardSidebarContext";

const OVERVIEW_ITEM = { label: "Overview", href: "/brand-portal", icon: LayoutDashboard };
const ORDERS_ITEM = { label: "Orders", href: "/brand-portal/orders", icon: ShoppingBag };
const INVENTORY_ITEM = { label: "Inventory", href: "/brand-portal/stock", icon: Package };
const PRODUCTS_ITEM = { label: "Products", href: "/brand-portal/products", icon: ShoppingCart };
const COLLECTIONS_ITEM = { label: "Collections", href: "/brand-portal/collections", icon: FolderKanban };
const PROFILE_ITEM = { label: "Brand Profile", href: "/brand-portal/page-content", icon: FileEdit };
const WAREHOUSE_ITEM = { label: "Local Warehouse", href: "/brand-portal/warehouse", icon: Warehouse };
const REVIEWS_ITEM = { label: "Reviews", href: "/brand-portal/reviews", icon: MessageSquare };
const ACTIVITY_ITEM = { label: "Activity", href: "/brand-portal/logs", icon: History };

export default function BrandPortalNav({ showPageContent = true, showWarehouse = false }: { showPageContent?: boolean; showWarehouse?: boolean }) {
  const { collapsed } = useDashboardSidebar();
  const pathname = usePathname();
  const brand = useSearchParams().get("brand");
  const withBrand = (href: string) => (brand ? `${href}?brand=${brand}` : href);
  // Organize destinations around the seller's workflow while preserving the
  // existing partner- and owner-only visibility rules.
  const groups = [
    { label: "Run", items: [OVERVIEW_ITEM, ORDERS_ITEM, INVENTORY_ITEM] },
    { label: "Build", items: [PRODUCTS_ITEM, COLLECTIONS_ITEM, ...(showPageContent ? [PROFILE_ITEM] : [])] },
    ...(showWarehouse ? [{ label: "Fulfillment", items: [WAREHOUSE_ITEM] }] : []),
    { label: "Insights", items: [REVIEWS_ITEM, ...(showPageContent ? [ACTIVITY_ITEM] : [])] },
  ];
  const allItems = groups.flatMap((group) => group.items);
  const activeHref = allItems
    .filter((item) => item.href === "/brand-portal" ? pathname === "/brand-portal" : pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label="Brand portal navigation" className="flex min-h-full flex-col">
      <div className={collapsed ? "space-y-3 pt-4" : "space-y-5"}>
        {groups.map((group) => (
          <div
            key={group.label}
            className={collapsed ? "mx-auto w-14 rounded-full border border-[#eee7de] bg-white p-1.5 shadow-[0_8px_24px_rgba(67,45,29,0.07)]" : undefined}
          >
            {!collapsed && (
              <p className="mb-1.5 flex items-center gap-2 px-3 text-[10.5px] font-semibold tracking-[-0.01em] text-[#a29489]">
                <span className="h-1 w-1 rounded-full bg-mahalyred/70" aria-hidden="true" />
                {group.label}
              </p>
            )}
            <div className={collapsed ? "space-y-1" : "space-y-0.5"}>
              {group.items.map((item) => {
                const active = activeHref === item.href;
                return (
                  <Link
                    key={item.href}
                    href={withBrand(item.href)}
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    className={`group relative flex items-center text-[13px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 active:scale-[0.96] ${collapsed ? "h-10 w-10 justify-center rounded-full" : "min-h-10 gap-3 rounded-lg px-3 py-2.5"} ${active ? (collapsed ? "bg-[#292725] text-white shadow-[0_6px_16px_rgba(52,39,31,0.2),inset_0_0_0_1px_rgba(200,89,86,0.35)]" : "bg-[#f3ebe4] text-[#242424]") : (collapsed ? "text-[#6f655e] hover:bg-[#f5eee8] hover:text-[#242424]" : "text-[#75685f] hover:bg-[#f7f1eb] hover:text-[#242424]")}`}
                  >
                    {active && !collapsed && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-mahalyred" aria-hidden="true" />}
                    <item.icon className={`h-[17px] w-[17px] flex-none transition-[color,transform] duration-200 ${collapsed ? "group-hover:scale-125 group-focus-visible:scale-125" : ""} ${active ? (collapsed ? "text-white" : "text-mahalyred") : "text-[#a29489] group-hover:text-[#574b43]"}`} strokeWidth={1.8} />
                    {collapsed ? (
                      <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg border border-[#e8dfd7] bg-[#fffdf9] px-3 py-2 text-[12px] font-semibold text-[#3f3732] opacity-0 shadow-[0_8px_22px_rgba(67,45,29,0.13)] transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
                        {item.label}
                      </span>
                    ) : item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className={collapsed ? "mt-auto" : "mt-auto border-t border-[#e3dcd3] pt-4"}>
        {!collapsed && <p className="mb-2 px-3 text-[10px] font-medium text-[#a29489]">Zakhnook website</p>}
        <div className={collapsed ? "mx-auto w-14 rounded-full border border-[#eee7de] bg-white p-1.5 shadow-[0_8px_24px_rgba(67,45,29,0.07)]" : undefined}>
          <Link
            href="/"
            aria-label="Back to homepage"
            className={`group relative flex items-center text-[13px] font-semibold text-[#75685f] transition-all duration-200 hover:text-[#242424] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 active:scale-[0.96] ${collapsed ? "h-10 w-10 justify-center rounded-full hover:bg-[#f5eee8]" : "min-h-10 gap-3 rounded-lg px-3 py-2.5 hover:bg-[#f7f1eb]"}`}
          >
            <House className={`h-[17px] w-[17px] flex-none text-[#a29489] transition-[color,transform] duration-200 group-hover:text-mahalyred ${collapsed ? "group-hover:scale-125 group-focus-visible:scale-125" : ""}`} strokeWidth={1.8} />
            {collapsed ? (
              <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg border border-[#e8dfd7] bg-[#fffdf9] px-3 py-2 text-[12px] font-semibold text-[#3f3732] opacity-0 shadow-[0_8px_22px_rgba(67,45,29,0.13)] transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
                Back to homepage
              </span>
            ) : <span>Back to homepage</span>}
          </Link>
        </div>
      </div>
    </nav>
  );
}
