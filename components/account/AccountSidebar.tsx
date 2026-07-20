"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Heart,
  MapPin,
  CreditCard,
  Bell,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV_ITEMS = [
  { label: "Overview", href: "/account/overview", icon: LayoutDashboard },
  { label: "Orders", href: "/account/orders", icon: Package },
  { label: "Wishlist", href: "/account/wishlist", icon: Heart },
  { label: "Addresses", href: "/account/addresses", icon: MapPin },
  { label: "Payment Methods", href: "/account/payment-methods", icon: CreditCard },
  { label: "Notifications", href: "/account/notifications", icon: Bell },
  { label: "Settings", href: "/account/settings", icon: Settings },
];

export default function AccountSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
              active ? "bg-beige-100 text-ink" : "text-ink-soft/70 hover:bg-stone-100 hover:text-ink"
            }`}
          >
            <item.icon className="h-4 w-4" strokeWidth={1.6} />
            {item.label}
          </Link>
        );
      })}

      <div className="my-2 border-t border-stone-150" />

      <button
        type="button"
        onClick={async () => {
          await signOut();
          router.push("/");
        }}
        className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-[13.5px] font-medium text-ink-soft/70 transition-colors hover:bg-stone-100 hover:text-ink"
      >
        <LogOut className="h-4 w-4" strokeWidth={1.6} />
        Log out
      </button>
    </nav>
  );
}
