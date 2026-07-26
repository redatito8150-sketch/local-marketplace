import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function BrandEmptyState({ title, description, href, action }: { title: string; description: string; href: string; action: string }) {
  return <div className="mx-auto flex max-w-xl flex-col items-center rounded-[28px] border border-[#eaded1] bg-[#fffaf4] px-6 py-16 text-center shadow-[0_20px_70px_rgba(82,48,37,.06)]"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f1e2d6] text-[#8f2335]"><Sparkles className="h-5 w-5" /></span><h2 className="mt-6 font-serif text-2xl text-[#261f1b]">{title}</h2><p className="mt-3 max-w-md text-sm leading-6 text-[#746961]">{description}</p><Link href={href} className="mt-7 rounded-full bg-[#8f2335] px-6 py-3 text-xs font-semibold text-white transition hover:bg-[#741a2a]">{action}</Link></div>;
}
