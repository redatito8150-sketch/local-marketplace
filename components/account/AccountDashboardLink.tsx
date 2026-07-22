import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

// Mirrors Header.tsx's dashboardHref logic, surfaced prominently inside the
// account dashboard itself (not just the small header icon) — visible only
// to the admin/brand_owner/brand_assistant accounts it's computed for.
export default function AccountDashboardLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--account-text)] px-4 text-[13px] font-semibold text-[var(--account-bg)] transition-colors hover:bg-[var(--account-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--account-accent)]/30"
    >
      <LayoutDashboard className="h-4 w-4" strokeWidth={1.8} />
      {label}
    </Link>
  );
}
