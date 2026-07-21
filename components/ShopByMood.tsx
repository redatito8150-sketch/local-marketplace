import Image from "next/image";
import Link from "next/link";
import type { MoodTileContent } from "@/types";

export default function ShopByMood({ tiles }: { tiles: MoodTileContent[] }) {
  if (!tiles.length) return null;
  return (
    <section className="mx-auto max-w-[1920px] px-6 py-4 md:px-10 xl:px-16">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-serif text-[25px] font-semibold tracking-tight">Shop by mood</h2><Link href="/brands" className="text-[11px] font-semibold text-mahalyred">View all</Link></div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {tiles.map((tile) => (
          <Link key={tile.id} href={tile.href} className="group relative h-[158px] overflow-hidden rounded-[8px] bg-stone-100">
            <Image src={tile.image} alt={tile.label} fill sizes="20vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/10 to-transparent" />
            <span className="absolute bottom-5 left-5 max-w-[130px] whitespace-pre-line font-serif text-[21px] font-semibold leading-[1.05] text-white">{tile.label.replace(" ", "\n")}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
