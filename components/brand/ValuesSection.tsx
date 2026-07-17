import { Flag, Package, Leaf, PenLine } from "lucide-react";
import { BrandValue } from "@/types";

const ICONS: Record<BrandValue["icon"], React.ElementType> = {
  flag: Flag,
  package: Package,
  leaf: Leaf,
  pen: PenLine,
};

export default function ValuesSection({ values }: { values: BrandValue[] }) {
  return (
    <section className="border-y border-hairline bg-stone-25">
      <div className="mx-auto max-w-brand px-6 py-24 lg:px-10 lg:py-28">
        <div className="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((value) => {
            const Icon = ICONS[value.icon];
            return (
              <div key={value.title} className="text-left">
                <Icon className="h-6 w-6 text-navy" strokeWidth={1.4} />
                <h3 className="mt-5 text-[15px] font-medium tracking-tight text-charcoal">
                  {value.title}
                </h3>
                <p className="mt-2.5 text-[13.5px] font-light leading-relaxed text-muted">
                  {value.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
