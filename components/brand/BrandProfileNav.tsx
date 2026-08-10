"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [["products", "Products"], ["collections", "Collections"], ["about", "About Us"], ["reviews", "Reviews"]] as const;

export default function BrandProfileNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Brand profile" className="border-t border-black/10 bg-[#fffaf4]">
      <div className="mx-auto max-w-brand overflow-x-auto px-5 no-scrollbar lg:px-10">
        <ul className="flex min-w-max items-center gap-8 sm:gap-11">
          {tabs.map(([route, label]) => {
            const href = `/brands/${slug}/${route}`;
            const active = pathname === href;
            return <li key={route}><Link href={href} aria-current={active ? "page" : undefined} className={`relative block py-5 text-[13px] font-semibold tracking-wide transition-colors ${active ? "text-[#AC3935]" : "text-[#625a53] hover:text-[#242424]"}`}>{label}<span className={`absolute inset-x-0 bottom-0 h-[3px] rounded-t-full bg-[#AC3935] transition-transform ${active ? "scale-x-100" : "scale-x-0"}`} /></Link></li>;
          })}
        </ul>
      </div>
    </nav>
  );
}
