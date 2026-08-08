import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Skeleton, { SkeletonText } from "@/components/shared/Skeleton";

export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col [&>*]:w-full bg-cream">
      <Header />
      <section className="mx-auto max-w-screen2xl px-8 py-12 lg:px-12 lg:py-16" aria-label="Loading cart" aria-busy="true">
        <Skeleton variant="text" className="h-8 w-40" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex gap-4 rounded-xl border border-stone-150 p-4">
                <Skeleton className="h-24 w-20 shrink-0" />
                <div className="flex-1 space-y-2">
                  <SkeletonText lines={2} lineClassName="h-3.5" />
                  <Skeleton className="h-8 w-28" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </section>
      <Footer />
    </main>
  );
}
