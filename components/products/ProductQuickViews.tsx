import Link from "next/link";
import { Archive } from "lucide-react";

export type ProductQuickView = {
  id: string;
  label: string;
  href: string;
  count: number;
  attention?: boolean;
};

export default function ProductQuickViews({ views, activeId, archived }: { views: ProductQuickView[]; activeId?: string | null; archived?: { href: string; count: number } }) {
  return (
    <div className="order-[2] flex min-w-0 items-center gap-2">
      <nav aria-label="Product quick views" className="flex h-10 min-w-0 overflow-x-auto rounded-xl border border-[#e5ddd5] bg-[#fcfaf8]">
        {views.map((view) => {
          const selected = view.id === activeId;
          const dot = view.id === "published" ? "bg-emerald-500" : view.id === "drafts" ? "bg-amber-500" : view.attention ? "bg-red-500" : "bg-[#C85956]";
          return (
            <Link
              key={view.id}
              href={view.href}
              aria-current={selected ? "page" : undefined}
              className={`inline-flex h-full flex-none items-center gap-1.5 border-r border-[#eee7e1] px-3 text-[10.5px] font-bold transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/25 ${selected ? "bg-[#f6e5e3] text-[#A94442]" : "text-[#6f635a] hover:bg-white hover:text-[#A94442]"}`}
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
              {view.label}
              <span className="tabular-nums text-[9.5px] opacity-70">{view.count}</span>
            </Link>
          );
        })}
      </nav>
      {archived ? (
        <Link aria-label={`Open Archived products, ${archived.count} products`} href={archived.href} className="inline-flex h-10 flex-none items-center gap-1.5 rounded-xl border border-[#e5ddd5] bg-[#fcfaf8] px-3 text-[10.5px] font-bold text-[#75685f] transition-colors hover:border-[#d8ccc3] hover:bg-white hover:text-[#A94442] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25">
          <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archived
          <span className="tabular-nums text-[9.5px] opacity-70">{archived.count}</span>
        </Link>
      ) : null}
    </div>
  );
}
