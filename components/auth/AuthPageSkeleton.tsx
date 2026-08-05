import Skeleton, { SkeletonButton, SkeletonText } from "@/components/shared/Skeleton";

// Matches app/account/page.tsx's dark split-screen shell exactly (same
// background gradients/rounded card), used as its Suspense fallback
// instead of a bare colored <div> — the useSearchParams() boundary there
// previously showed nothing but the background color while resolving.
export default function AuthPageSkeleton() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#090607] p-3 sm:p-5 lg:p-6">
      <div className="pointer-events-none absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-[#7f0e15]/32 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-48 right-[18%] h-[560px] w-[560px] rounded-full bg-[#4d070d]/42 blur-[150px]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-48px)] max-w-[1540px] overflow-hidden rounded-[36px] border border-white/10 bg-[#160b0e]/72 shadow-[0_36px_120px_rgba(0,0,0,.48)] backdrop-blur-xl lg:grid-cols-[1.08fr_.92fr]">
        <div className="hidden p-3 lg:block">
          <Skeleton tone="dark" className="h-full w-full rounded-[28px]" />
        </div>

        <section className="relative flex min-h-[760px] flex-col px-5 py-5 sm:px-9 lg:min-h-0 lg:px-12 xl:px-16" aria-label="Loading sign in" aria-busy="true">
          <div className="flex items-center justify-between">
            <Skeleton tone="dark" className="h-7 w-24" />
            <Skeleton tone="dark" className="h-7 w-16 rounded-full" />
          </div>

          <div className="mx-auto flex w-full max-w-[500px] flex-1 flex-col justify-center py-10 lg:py-8">
            <Skeleton tone="dark" className="h-11 w-full rounded-2xl" />
            <div className="mt-7 space-y-2">
              <Skeleton tone="dark" variant="text" className="h-3 w-24" />
              <Skeleton tone="dark" variant="text" className="h-9 w-64" />
              <SkeletonText tone="dark" lines={2} className="mt-1" lineClassName="h-3" />
            </div>

            <Skeleton tone="dark" className="mt-6 h-[50px] w-full rounded-2xl" />

            <div className="mt-5 space-y-3">
              <Skeleton tone="dark" className="h-[50px] w-full rounded-2xl" />
              <Skeleton tone="dark" className="h-[50px] w-full rounded-2xl" />
              <SkeletonButton tone="dark" className="mt-2 rounded-2xl" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
