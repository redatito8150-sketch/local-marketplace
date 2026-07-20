"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BarChart3,
  ChevronDown,
  History,
  LayoutDashboard,
  LayoutTemplate,
  Package,
  Settings,
  ShoppingBag,
  Store,
  Tag,
  Users,
} from "lucide-react";

type Role = "staff" | "manager" | "admin";

interface NavChild {
  label: string;
  href: string;
  minRole?: Role;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  minRole: Role;
  children?: NavChild[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, minRole: "staff" },
  {
    label: "Products",
    href: "/admin/products",
    icon: Package,
    minRole: "staff",
    children: [
      { label: "All Products", href: "/admin/products" },
      { label: "Brand Activity", href: "/admin/products/review" },
      { label: "Categories", href: "/admin/products/categories", minRole: "manager" },
    ],
  },
  { label: "Low Stock", href: "/admin/low-stock", icon: AlertTriangle, minRole: "staff" },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3, minRole: "staff" },
  {
    label: "Brands",
    href: "/admin/brands",
    icon: Store,
    minRole: "staff",
    children: [
      { label: "All Brands", href: "/admin/brands" },
      { label: "Applications", href: "/admin/applications" },
    ],
  },
  { label: "Coupons", href: "/admin/coupons", icon: Tag, minRole: "manager" },
  { label: "Content", href: "/admin/content", icon: LayoutTemplate, minRole: "manager" },
  { label: "Settings", href: "/admin/settings", icon: Settings, minRole: "manager" },
  { label: "Orders", href: "/admin/orders", icon: ShoppingBag, minRole: "staff" },
  { label: "Users", href: "/admin/users", icon: Users, minRole: "staff" },
  { label: "Notifications", href: "/admin/notifications", icon: Bell, minRole: "staff" },
  { label: "Audit Log", href: "/admin/audit-log", icon: History, minRole: "admin" },
];

const ROLE_RANK: Record<string, number> = { staff: 1, manager: 2, admin: 3 };
const canSee = (role: string, minRole: Role) => (ROLE_RANK[role] ?? 0) >= ROLE_RANK[minRole];

export default function AdminSidebar({
  unreadNotifications = 0,
  lowStockCount = 0,
  reviewQueueCount = 0,
  role = "admin",
}: {
  unreadNotifications?: number;
  lowStockCount?: number;
  reviewQueueCount?: number;
  role?: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const visibleItems = NAV_ITEMS.filter((item) => canSee(role, item.minRole)).map((item) => ({
    ...item,
    children: item.children?.filter((child) => canSee(role, child.minRole ?? "staff")),
  }));

  const badgeCounts: Record<string, number> = {
    "/admin/notifications": unreadNotifications,
    "/admin/low-stock": lowStockCount,
    "/admin/products": reviewQueueCount,
    "/admin/products/review": reviewQueueCount,
  };

  const isChildActive = (item: NavItem) =>
    item.children?.some((child) => pathname.startsWith(child.href)) ?? false;

  return (
    <nav className="flex flex-col gap-1">
      {visibleItems.map((item) => {
        const hasChildren = (item.children?.length ?? 0) > 0;
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        const badgeCount = badgeCounts[item.href] ?? 0;
        // Expanded by default whenever the current page is this group or
        // one of its children — otherwise collapsed until clicked.
        const defaultExpanded = active || isChildActive(item);
        const expanded = collapsed[item.href] === undefined ? defaultExpanded : !collapsed[item.href];

        return (
          <div key={item.href}>
            <div className="flex items-center">
              <Link
                href={item.href}
                className={`flex flex-1 items-center gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                  active && !isChildActive(item)
                    ? "bg-beige-100 text-ink"
                    : "text-ink-soft/70 hover:bg-stone-100 hover:text-ink"
                }`}
              >
                <item.icon className="h-4 w-4" strokeWidth={1.6} />
                {item.label}
                {badgeCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-ink px-1.5 text-[10.5px] font-semibold text-cream">
                    {badgeCount}
                  </span>
                )}
              </Link>
              {hasChildren && (
                <button
                  type="button"
                  aria-label={expanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
                  onClick={() => setCollapsed((c) => ({ ...c, [item.href]: expanded }))}
                  className="rounded-md p-2 text-ink-soft/50 hover:bg-stone-100 hover:text-ink"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                    strokeWidth={2}
                  />
                </button>
              )}
            </div>

            {hasChildren && expanded && (
              <div className="ml-6 mt-0.5 flex flex-col gap-0.5 border-l border-stone-150 pl-3">
                {item.children!.map((child) => {
                  const childActive = pathname.startsWith(child.href);
                  const childBadge = badgeCounts[child.href] ?? 0;
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] font-medium transition-colors ${
                        childActive
                          ? "bg-beige-100 text-ink"
                          : "text-ink-soft/60 hover:bg-stone-100 hover:text-ink"
                      }`}
                    >
                      {child.label}
                      {childBadge > 0 && (
                        <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-ink px-1.5 text-[10.5px] font-semibold text-cream">
                          {childBadge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="my-2 border-t border-stone-150" />

      <Link
        href="/brand-portal"
        className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] font-medium text-ink-soft/70 hover:bg-stone-100 hover:text-ink"
      >
        <Store className="h-4 w-4" strokeWidth={1.6} />
        Brand Portal
      </Link>

      <Link
        href="/"
        className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] font-medium text-ink-soft/70 hover:bg-stone-100 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.6} />
        Back to site
      </Link>
    </nav>
  );
}
