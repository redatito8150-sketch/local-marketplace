import { BarChart3, Check, Tag, Users } from "lucide-react";
import { JOIN_BENEFITS, WHY_LOCAL_CHECKLIST, type JoinBenefit } from "@/content/join";

const ICONS: Record<JoinBenefit["icon"], React.ElementType> = {
  users: Users,
  tag: Tag,
  chart: BarChart3,
};

export default function JoinBenefits() {
  return (
    <section className="mx-auto max-w-screen2xl px-8 py-20 lg:px-12">
      <h2 className="text-center font-serif text-3xl font-semibold text-ink lg:text-4xl">
        Why join Local?
      </h2>

      <div className="mt-14 grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
        {JOIN_BENEFITS.map((benefit, i) => {
          const Icon = ICONS[benefit.icon];
          return (
            <div
              key={benefit.title}
              className={`px-2 text-center lg:px-8 ${
                i > 0 ? "lg:border-l lg:border-stone-150" : ""
              }`}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-beige-100">
                <Icon className="h-5 w-5 text-ink" strokeWidth={1.6} />
              </div>
              <h3 className="mt-5 text-[15px] font-semibold text-ink">{benefit.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft/70">
                {benefit.description}
              </p>
            </div>
          );
        })}

        <div className="border-stone-150 px-2 lg:border-l lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-beige-100">
              <Check className="h-4 w-4 text-ink" strokeWidth={2} />
            </div>
            <h3 className="text-[15px] font-semibold text-ink">Why Local?</h3>
          </div>
          <ul className="mt-4 space-y-2.5">
            {WHY_LOCAL_CHECKLIST.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13.5px] text-ink-soft/75">
                <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-ink" strokeWidth={2.2} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
