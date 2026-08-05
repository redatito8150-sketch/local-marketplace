import Link from "next/link";
import { LockKeyhole, RefreshCw, LayoutGrid } from "lucide-react";
import Logo from "@/components/shared/Logo";

const columns = [
  { title: "Shop", links: ["New arrivals", "Women", "Men", "Home", "Kids"] },
  { title: "Discover", links: ["Brands", "Collections", "Stories", "Gift cards", "Local guides"] },
  { title: "Help", links: ["Contact us", "FAQs", "Shipping & returns", "Terms & conditions", "Privacy Policy"] },
  { title: "About", links: ["Our mission", "For brands", "Careers", "Press"] },
];

// Every label above that maps to a real, existing route. Anything NOT in
// this map has no accurate destination yet (no /contact, /returns,
// /shipping, /collections, /gift-cards, etc. page exists — see
// docs/legal-placeholders-todo.md) and renders as plain, non-interactive
// text instead of a dead hash link.
const FOOTER_HREFS: Record<string, string> = {
  "New arrivals": "/new-arrivals",
  Women: "/shop/women",
  Men: "/shop/men",
  Home: "/shop/home",
  Kids: "/shop/kids",
  Brands: "/brands",
  Stories: "/journal",
  "For brands": "/join-as-a-brand",
  "Terms & conditions": "/terms",
  "Privacy Policy": "/privacy",
};

export default function Footer({
  homeGradient = false,
  warmTransparent = false,
}: {
  homeGradient?: boolean;
  warmTransparent?: boolean;
}) {
  return (
    <footer
      id="about"
      className={`border-t border-stone-150 ${
        warmTransparent
          ? "border-white/30 bg-[#d8bea3]/55 backdrop-blur-xl"
          : homeGradient
            ? "border-white/30 bg-neutral-500/20 backdrop-blur-lg"
            : "border-white/30 bg-neutral-500/20 backdrop-blur-lg"
      }`}
    >
      <div className="mx-auto max-w-[1920px] px-6 py-5 md:px-10 xl:px-16">
        <div className="grid gap-8 md:grid-cols-[1.4fr_repeat(4,0.75fr)_1.3fr]">
          <div><Logo /><p className="mt-3 max-w-[210px] text-[10px] leading-5 text-ink-soft/65">The marketplace designed<br />for local brands and real stories.</p></div>
          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="mb-2 text-[10px] font-bold">{column.title}</h3>
              <ul className="space-y-1">
                {column.links.map((label) => {
                  const href = FOOTER_HREFS[label];
                  return (
                    <li key={label}>
                      {href ? (
                        <Link href={href} className="text-[9px] text-ink-soft/75">
                          {label}
                        </Link>
                      ) : (
                        <span aria-disabled="true" className="cursor-default text-[9px] text-ink-soft/35">
                          {label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="flex items-start justify-end gap-8 pt-5 text-[9px] text-ink-soft/70">
            <span className="flex items-center gap-2"><LockKeyhole className="h-5 w-5" />Secure<br />payments</span>
            <span className="flex items-center gap-2"><RefreshCw className="h-5 w-5" />Easy<br />returns</span>
            <span className="flex items-center gap-2"><LayoutGrid className="h-5 w-5" />Support<br />local</span>
          </div>
        </div>
        <p className="mt-2 text-right text-[9px] text-ink-soft/55">© 2024 Mahaly Marketplace. All rights reserved.</p>
      </div>
    </footer>
  );
}
