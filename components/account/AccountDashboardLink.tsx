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
      className="flex items-center justify-center gap-2 rounded-xl3 bg-ink px-4 py-3 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02]"
    >
      <LayoutDashboard className="h-4 w-4" strokeWidth={1.8} />
      {label}
    </Link>
  );
}
