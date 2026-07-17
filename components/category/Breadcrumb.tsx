import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function Breadcrumb({ current }: { current: string }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mx-auto max-w-screen3xl px-8 py-4 text-xs text-ink-soft/50 lg:px-[60px]"
    >
      <ol className="flex items-center gap-1.5">
        <li>
          <Link href="/" className="transition-colors hover:text-ink">
            Home
          </Link>
        </li>
        <li className="flex items-center gap-1.5">
          <ChevronRight className="h-3 w-3" strokeWidth={2} />
          <span className="text-ink-soft/70">{current}</span>
        </li>
      </ol>
    </nav>
  );
}
