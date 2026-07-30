import { BarChart3, Check, Tag, Users } from "lucide-react";
import { JOIN_BENEFITS, WHY_LOCAL_CHECKLIST, type JoinBenefit } from "@/content/join";

const ICONS: Record<JoinBenefit["icon"], React.ElementType> = {
  users: Users,
  tag: Tag,
  chart: BarChart3,
};

export default function JoinBenefits() {
  return (
    <section className="mx-auto max-w-[1500px] px-6 py-20 md:px-10 xl:px-12">
      <p className="text-center text-[10px] font-bold uppercase tracking-[0.24em] text-mahalyred">Built for local growth</p>
      <h2 className="mt-2 text-center text-3xl font-semibold tracking-[-0.04em] text-ink lg:text-4xl">
        Why join Local?
      </h2>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {JOIN_BENEFITS.map((benefit, i) => {
          const Icon = ICONS[benefit.icon];
          return (
            <div
              key={benefit.title}
              className="rounded-[26px] border border-white/45 bg-white/35 px-6 py-8 text-center shadow-[0_16px_50px_rgba(45,28,20,.08)] backdrop-blur-lg"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-mahalyred/10">
                <Icon className="h-5 w-5 text-mahalyred" strokeWidth={1.6} />
              </div>
              <h3 className="mt-5 text-[15px] font-semibold text-ink">{benefit.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft/70">
                {benefit.description}
              </p>
            </div>
          );
        })}

        <div className="rounded-[26px] border border-white/45 bg-ink/[0.84] px-6 py-8 text-cream shadow-[0_16px_50px_rgba(45,28,20,.14)] backdrop-blur-lg">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-beige-100">
              <Check className="h-4 w-4 text-ink" strokeWidth={2} />
            </div>
            <h3 className="text-[15px] font-semibold text-cream">Why Local?</h3>
          </div>
          <ul className="mt-4 space-y-2.5">
            {WHY_LOCAL_CHECKLIST.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13.5px] text-cream/70">
                <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-mahalyred" strokeWidth={2.2} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
