"use client";

import Link from "next/link";
import { Archive, Download, Ellipsis, History } from "lucide-react";
import { useEffect, useRef } from "react";

export default function ProductCatalogTools({ archivedCount }: { archivedCount: number }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!(event.target instanceof Node) || detailsRef.current?.contains(event.target)) return;
      if (detailsRef.current) detailsRef.current.open = false;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && detailsRef.current) detailsRef.current.open = false;
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details ref={detailsRef} className="group relative">
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-[#ddd6cd] bg-white px-3.5 text-[12px] font-semibold text-[#62564d] transition-colors duration-150 hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 [&::-webkit-details-marker]:hidden">
        <Ellipsis className="h-4 w-4" aria-hidden="true" /> Catalog tools
      </summary>
      <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-60 rounded-xl border border-[#e3dcd3] bg-white p-1.5 shadow-[0_18px_45px_rgba(67,45,29,0.14)]">
        <Link href="/admin/products/archived" className="flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold text-[#51473f] hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"><Archive className="h-4 w-4" aria-hidden="true" />Archived products<span className="ml-auto rounded-md bg-[#eee7df] px-1.5 py-0.5 text-[10px] tabular-nums text-[#75685f]">{archivedCount}</span></Link>
        <Link href="/admin/products/deletion-history" className="flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold text-[#51473f] hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"><History className="h-4 w-4" aria-hidden="true" />Deletion history</Link>
        {/* A file download endpoint, not a navigable page. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/admin/products/export" className="flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold text-[#51473f] hover:bg-[#f7f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"><Download className="h-4 w-4" aria-hidden="true" />Export CSV</a>
      </div>
    </details>
  );
}
