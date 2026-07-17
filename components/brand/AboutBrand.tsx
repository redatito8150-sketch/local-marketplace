import { MapPin, Flag, Truck, Leaf } from "lucide-react";
import { BrandPageContent, BrandInfoBadge } from "@/types";

const ICONS: Record<BrandInfoBadge["icon"], React.ElementType> = {
  location: MapPin,
  flag: Flag,
  truck: Truck,
  leaf: Leaf,
};

export default function AboutBrand({ brand }: { brand: BrandPageContent }) {
  return (
    <section className="mx-auto max-w-brand px-6 py-24 lg:px-10 lg:py-32">
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        {/* logo placeholder */}
        <div
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded-full border border-hairline text-[13px] font-semibold tracking-widest text-navy"
        >
          MS
        </div>

        <h2 className="mt-8 text-2xl font-medium tracking-tight text-charcoal lg:text-[1.75rem]">
          {brand.name}
        </h2>
        <p className="mt-2 text-[13px] font-medium uppercase tracking-[0.12em] text-muted">
          Founded in {brand.city} in {brand.foundedYear}
        </p>

        <p className="mt-7 text-[15px] font-light leading-[1.85] text-charcoal/75 lg:text-base">
          {brand.aboutDescription}
        </p>

        <div className="mt-11 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {brand.infoBadges.map((badge) => {
            const Icon = ICONS[badge.icon];
            return (
              <span
                key={badge.label}
                className="flex items-center gap-2 text-[13px] font-medium text-charcoal/70"
              >
                <Icon className="h-4 w-4 text-navy" strokeWidth={1.6} />
                {badge.label}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
