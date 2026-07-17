import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function ApplyBrandCTA({
  label,
  variant = "dark",
  className = "",
}: {
  label: string;
  variant?: "dark" | "light";
  className?: string;
}) {
  return (
    <Link
      href="/join-as-a-brand/apply"
      className={`inline-flex items-center gap-2.5 rounded-full px-7 py-4 text-[15px] font-semibold shadow-soft transition-transform hover:scale-[1.02] hover:shadow-card ${
        variant === "dark" ? "bg-ink text-cream" : "bg-cream text-ink"
      } ${className}`}
    >
      {label}
      <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
    </Link>
  );
}
