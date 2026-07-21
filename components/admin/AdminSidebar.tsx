"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  FileText,
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

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  minRole?: Role;
  badge?: "notifications" | "lowStock" | "brandActivity";
}

const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: "Overview", href: "/admin", icon: LayoutDashboard },
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Commerce",
    items: [
      { label: "Orders", href: "/admin/orders", icon: ShoppingBag },
      { label: "Products", href: "/admin/products", icon: Package },
      { label: "Categories", href: "/admin/products/categories", icon: LayoutTemplate, minRole: "manager" },
      { label: "Low Stock", href: "/admin/low-stock", icon: AlertTriangle, badge: "lowStock" },
      { label: "Coupons", href: "/admin/coupons", icon: Tag, minRole: "manager" },
    ],
  },
  {
    label: "Brands",
    items: [
      { label: "All Brands", href: "/admin/brands", icon: Store },
      { label: "Applications", href: "/admin/applications", icon: FileText },
      { label: "Brand Activity", href: "/admin/products/review", icon: History, badge: "brandActivity" },
    ],
  },
  {
    label: "People & Content",
    items: [
      { label: "Users & Access", href: "/admin/users", icon: Users },
      { label: "Site Content", href: "/admin/content", icon: LayoutTemplate, minRole: "manager" },
      { label: "Notifications", href: "/admin/notifications", icon: Bell, badge: "notifications" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Audit Log", href: "/admin/audit-log", icon: History, minRole: "admin" },
      { label: "Settings", href: "/admin/settings", icon: Settings, minRole: "manager" },
    ],
  },
];

const ROLE_RANK: Record<string, number> = { staff: 1, manager: 2, admin: 3 };
const canSee = (role: string, minRole: Role = "staff") => (ROLE_RANK[role] ?? 0) >= ROLE_RANK[minRole];

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
  const counts = { notifications: unreadNotifications, lowStock: lowStockCount, brandActivity: reviewQueueCount };
  const activeHref = NAV_GROUPS.flatMap((group) => group.items)
    .filter((item) => item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav aria-label="Admin navigation" className="space-y-6">
      {NAV_GROUPS.map((group, index) => {
        const items = group.items.filter((item) => canSee(role, item.minRole));
        if (!items.length) return null;
        return (
          <div key={group.label ?? index}>
            {group.label && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{group.label}</p>}
            <div className="space-y-1">
              {items.map((item) => {
                const active = activeHref === item.href;
                const count = item.badge ? counts[item.badge] : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 ${active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
                  >
                    <item.icon className={`h-[17px] w-[17px] ${active ? "text-white" : "text-slate-400 group-hover:text-slate-700"}`} strokeWidth={1.8} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {count > 0 && <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${active ? "bg-white/15 text-white" : "bg-red-50 text-mahalyred"}`}>{count}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="border-t border-slate-200 pt-4">
        <Link href="/brand-portal" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950">
          <Store className="h-[17px] w-[17px] text-slate-400" /> Brand Portal
        </Link>
        <Link href="/" className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950">
          <ArrowLeft className="h-[17px] w-[17px] text-slate-400" /> Storefront
        </Link>
      </div>
    </nav>
  );
}
