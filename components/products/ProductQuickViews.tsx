import Link from "next/link";
import { AlertTriangle, Archive } from "lucide-react";

export type ProductQuickView = {
  id: string;
  label: string;
  href: string;
  count: number;
  attention?: boolean;
};

export default function ProductQuickViews({ views, activeId, archived }: { views: ProductQuickView[]; activeId?: string | null; archived?: { href: string; count: number } }) {
  return (
    <nav aria-label="Product quick views" className="mt-5 flex gap-2 overflow-x-auto pb-1">
      {views.map((view) => {
        const selected = view.id === activeId;
        return (
          <Link
            key={view.id}
            href={view.href}
            aria-current={selected ? "page" : undefined}
            className={`inline-flex h-10 flex-none items-center gap-2 rounded-xl border px-3.5 text-[12px] font-semibold transition-[background-color,border-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 active:scale-[0.98] ${selected
              ? "border-mahalyred bg-mahalyred text-white"
              : view.attention && view.count > 0
                ? "border-[#edcbc7] bg-[#fff7f5] text-mahalyred hover:bg-[#f8e9e7]"
                : "border-[#e3dcd3] bg-white text-[#62564d] hover:bg-[#f7f2ec]"}`}
          >
            {view.attention ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {view.label}
            <span className={`min-w-5 rounded-md px-1.5 py-0.5 text-center text-[10.5px] tabular-nums ${selected ? "bg-white/20 text-white" : "bg-[#eee7df] text-[#75685f]"}`}>{view.count}</span>
          </Link>
        );
      })}
      {archived ? (
        <Link href={archived.href} className="inline-flex h-10 flex-none items-center gap-2 rounded-xl border border-[#e3dcd3] bg-white px-3.5 text-[12px] font-semibold text-[#62564d] transition-colors duration-150 hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">
          <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archived
          <span className="min-w-5 rounded-md bg-[#eee7df] px-1.5 py-0.5 text-center text-[10.5px] tabular-nums text-[#75685f]">{archived.count}</span>
        </Link>
      ) : null}
    </nav>
  );
}

