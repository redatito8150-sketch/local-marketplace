"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  LayoutDashboard,
  Package,
  ShoppingBag,
  Store,
  Users,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Brands", href: "/admin/brands", icon: Store },
  { label: "Orders", href: "/admin/orders", icon: ShoppingBag },
  { label: "Applications", href: "/admin/applications", icon: FileText },
  { label: "Users", href: "/admin/users", icon: Users },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
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
