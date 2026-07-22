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
  Palette,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV_ITEMS = [
  { label: "Overview", href: "/account/overview", icon: LayoutDashboard },
  { label: "Orders", href: "/account/orders", icon: Package },
  { label: "Wishlist", href: "/account/wishlist", icon: Heart },
  { label: "Addresses", href: "/account/addresses", icon: MapPin },
  { label: "Payment Methods", href: "/account/payment-methods", icon: CreditCard },
  { label: "Notifications", href: "/account/notifications", icon: Bell },
  { label: "Personal Information", href: "/account/settings", icon: Settings },
  { label: "Security", href: "/account/security", icon: ShieldCheck },
  { label: "Appearance", href: "/account/appearance", icon: Palette },
];

export default function AccountSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();

  return (
    <nav
      aria-label="Account navigation"
      className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0"
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--account-accent)]/30 lg:w-full ${
              active
                ? "bg-[var(--account-selected)] text-[var(--account-accent)]"
                : "text-[var(--account-text-muted)] hover:bg-[var(--account-surface-muted)] hover:text-[var(--account-text)]"
            }`}
          >
            <item.icon className="h-4 w-4" strokeWidth={1.6} />
            {item.label}
          </Link>
        );
      })}

      <div className="my-2 hidden border-t border-[var(--account-border)] lg:block" />

      <button
        type="button"
        onClick={async () => {
          await signOut();
          router.push("/");
        }}
        className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-[13px] font-semibold text-[var(--account-text-muted)] transition-colors hover:bg-[var(--account-surface-muted)] hover:text-[var(--account-danger)] lg:w-full"
      >
        <LogOut className="h-4 w-4" strokeWidth={1.6} />
        Log out
      </button>
    </nav>
  );
}
