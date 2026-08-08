import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Skeleton from "@/components/shared/Skeleton";
import { BrandCardSkeletonGrid } from "@/components/shared/BrandCardSkeleton";

export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col [&>*]:w-full overflow-hidden bg-[#f7f1e9] text-[#211b17]">
      <Header warmTransparent />
      <section className="mx-auto max-w-screen2xl px-4 pb-8 pt-8 sm:px-6 lg:px-12 lg:pb-10 lg:pt-10">
        <div className="grid gap-6 lg:grid-cols-[0.78fr_1.42fr] lg:items-stretch">
          <div className="space-y-4 py-4 lg:py-8">
            <Skeleton variant="text" className="h-3 w-24" />
            <Skeleton variant="text" className="h-16 w-full max-w-lg" />
            <Skeleton variant="text" className="h-4 w-full max-w-md" />
          </div>
          <Skeleton className="min-h-[420px] rounded-[28px] lg:min-h-[500px]" />
        </div>
      </section>
      <section className="mx-auto max-w-screen2xl px-4 pb-16 sm:px-6 lg:px-12" aria-label="Loading brands" aria-busy="true">
        <BrandCardSkeletonGrid count={8} />
      </section>
      <Footer />
    </main>
  );
}
