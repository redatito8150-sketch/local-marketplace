import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CollectionCardContent } from "@/types";

export default function CollectionCards({
  cards,
}: {
  cards: CollectionCardContent[];
}) {
  return (
    <section className="mx-auto max-w-screen3xl px-8 pt-6 lg:px-[60px]">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={card.href}
            className="group flex h-[105px] items-center overflow-hidden rounded-[18px] bg-stone-50 pr-5 transition-colors hover:bg-stone-100 lg:h-[112px]"
          >
            <div className="relative h-full w-[92px] flex-none overflow-hidden lg:w-[100px]">
              <Image
                src={card.image}
                alt={card.title}
                fill
                sizes="100px"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>

            <div className="flex flex-1 items-center justify-between pl-5">
              <span className="font-serif text-xl font-semibold text-ink lg:text-2xl">
                {card.title}
              </span>
            </div>

            <div className="flex flex-none items-center gap-1.5 pl-3 text-xs font-medium text-ink-soft/70">
              {card.ctaLabel}
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
