import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandShopTheLookTile } from "@/types";

export default function ShopTheLook({ tiles }: { tiles: BrandShopTheLookTile[] }) {
  if (tiles.length === 0) return null;

  return (
    <section className="mx-auto max-w-brand px-6 pb-24 lg:px-10">
      <h2 className="mb-8 text-2xl font-medium tracking-tight text-charcoal">Shop the Look</h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.slice(0, 4).map((tile, i) => (
          <Link
            key={i}
            href={tile.href || "#shop"}
            className="group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-xl2 bg-stone-100"
          >
            <Image
              src={tile.image}
              alt={tile.title}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="relative z-10 p-5 text-white">
              <p className="text-[16px] font-medium tracking-tight">{tile.title}</p>
              <span className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-white/85">
                Explore
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
