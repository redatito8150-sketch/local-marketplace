"use client";

import { motion, MotionConfig } from "framer-motion";
import { FileCheck2, MessageCircleMore, PackageOpen, Rocket, ScanSearch } from "lucide-react";

const STEPS = [
  { title: "Apply", description: "Fill out a simple application about your brand and business.", icon: FileCheck2 },
  { title: "Review", description: "Our team reviews your application within 2-3 business days.", icon: ScanSearch },
  { title: "Onboarding", description: "Complete onboarding and set up your brand profile and preferences.", icon: MessageCircleMore },
  { title: "List products", description: "Add your products, set your prices, and organize your catalog.", icon: PackageOpen },
  { title: "Start selling", description: "Go live and start reaching millions of customers.", icon: Rocket },
];

export default function JoinJourney() {
  return (
    <MotionConfig reducedMotion="never">
      <section className="mx-auto max-w-[1500px] px-6 pb-20 md:px-10 xl:px-12">
        <div className="overflow-hidden rounded-[34px] border border-white/45 bg-white/35 px-6 py-12 shadow-[0_25px_80px_rgba(45,28,20,.12)] backdrop-blur-xl lg:px-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.65 }}
            className="text-center"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-mahalyred">From idea to storefront</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink lg:text-[40px]">Your journey in 5 easy steps</h2>
            <span className="mx-auto mt-5 block h-1 w-10 rounded-full bg-mahalyred" />
          </motion.div>

          <div className="relative mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5">
            <div className="absolute left-[10%] right-[10%] top-12 hidden border-t border-dashed border-mahalyred/25 lg:block" aria-hidden />
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.article
                  key={step.title}
                  initial={{ opacity: 0, y: 35, scale: 0.96 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ type: "spring", stiffness: 95, damping: 18, delay: index * 0.08 }}
                  className="relative z-10 text-center"
                >
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[28px] border border-white/60 bg-cream/75 text-mahalyred shadow-[0_12px_35px_rgba(92,40,31,.1)] backdrop-blur-md">
                    <Icon className="h-8 w-8" strokeWidth={1.55} />
                  </div>
                  <span className="mx-auto -mt-2 flex h-8 w-8 items-center justify-center rounded-full border border-stone-150 bg-white text-[11px] font-bold text-ink shadow-sm">{index + 1}</span>
                  <h3 className="mt-4 text-[15px] font-bold text-ink">{step.title}</h3>
                  <p className="mx-auto mt-2 max-w-[210px] text-[12.5px] leading-5 text-ink-soft/65">{step.description}</p>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
