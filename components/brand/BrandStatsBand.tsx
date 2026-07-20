import { Calendar, MapPin, ShoppingBag, Users, Star } from "lucide-react";
import { formatCompactNumber } from "@/lib/format";

export default function BrandStatsBand({
  foundedYear,
  city,
  productCount,
  followerCount,
  storeRating,
}: {
  foundedYear: number;
  city: string;
  productCount: number;
  followerCount: number;
  storeRating: number;
}) {
  const stats = [
    { icon: Calendar, label: "Founded", value: String(foundedYear) },
    { icon: MapPin, label: "Based in", value: city },
    { icon: ShoppingBag, label: "Products", value: `${productCount}+` },
    { icon: Users, label: "Followers", value: formatCompactNumber(followerCount) },
    { icon: Star, label: "Store Rating", value: `${storeRating.toFixed(1)} / 5.0` },
  ];

  return (
    <div className="relative z-10 mx-auto -mt-12 max-w-brand px-6 lg:-mt-16 lg:px-10">
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5 rounded-2xl border border-hairline bg-white px-8 py-6 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)] sm:justify-between">
        {stats.map((stat, i) => (
          <div key={stat.label} className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <stat.icon className="h-4 w-4 text-navy" strokeWidth={1.6} />
              <div className="leading-tight">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                  {stat.label}
                </p>
                <p className="text-[13.5px] font-semibold text-charcoal">{stat.value}</p>
              </div>
            </div>
            {i < stats.length - 1 && (
              <div className="hidden h-8 w-px bg-hairline sm:block" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
