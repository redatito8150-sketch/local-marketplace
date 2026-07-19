"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  FileText,
  History,
  LayoutDashboard,
  Package,
  ShoppingBag,
  Store,
  Tag,
  Users,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, minRole: "staff" as const },
  { label: "Products", href: "/admin/products", icon: Package, minRole: "staff" as const },
  { label: "Low Stock", href: "/admin/low-stock", icon: AlertTriangle, minRole: "staff" as const },
  { label: "Brands", href: "/admin/brands", icon: Store, minRole: "staff" as const },
  { label: "Coupons", href: "/admin/coupons", icon: Tag, minRole: "manager" as const },
  { label: "Orders", href: "/admin/orders", icon: ShoppingBag, minRole: "staff" as const },
  { label: "Applications", href: "/admin/applications", icon: FileText, minRole: "staff" as const },
  { label: "Users", href: "/admin/users", icon: Users, minRole: "staff" as const },
  { label: "Notifications", href: "/admin/notifications", icon: Bell, minRole: "staff" as const },
  { label: "Audit Log", href: "/admin/audit-log", icon: History, minRole: "admin" as const },
];

const ROLE_RANK: Record<string, number> = { staff: 1, manager: 2, admin: 3 };

export default function AdminSidebar({
  unreadNotifications = 0,
  lowStockCount = 0,
  role = "admin",
}: {
  unreadNotifications?: number;
  lowStockCount?: number;
  role?: string;
}) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter(
    (item) => (ROLE_RANK[role] ?? 0) >= ROLE_RANK[item.minRole]
  );
  const badgeCounts: Record<string, number> = {
    "/admin/notifications": unreadNotifications,
    "/admin/low-stock": lowStockCount,
  };

  return (
    <nav className="flex flex-col gap-1">
      {visibleItems.map((item) => {
        const active =
          item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        const badgeCount = badgeCounts[item.href] ?? 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
              active
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
        );
      })}

      <div className="my-2 border-t border-stone-150" />

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
