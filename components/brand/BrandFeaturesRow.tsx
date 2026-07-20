import { Gem, LayoutGrid, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { BRAND_FEATURES, BrandFeature } from "@/content/brandFeatures";

const ICONS: Record<BrandFeature["icon"], React.ElementType> = {
  gem: Gem,
  layout: LayoutGrid,
  rotateCcw: RotateCcw,
  shieldCheck: ShieldCheck,
  truck: Truck,
};

export default function BrandFeaturesRow() {
  return (
    <section className="border-t border-hairline">
      <div className="mx-auto grid max-w-brand grid-cols-2 gap-y-10 px-6 py-16 sm:grid-cols-3 lg:grid-cols-5 lg:px-10">
        {BRAND_FEATURES.map((feature) => {
          const Icon = ICONS[feature.icon];
          return (
            <div key={feature.label} className="flex flex-col items-center text-center">
              <Icon className="h-6 w-6 text-navy" strokeWidth={1.4} />
              <p className="mt-3 text-[13px] font-medium tracking-wide text-charcoal">
                {feature.label}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
