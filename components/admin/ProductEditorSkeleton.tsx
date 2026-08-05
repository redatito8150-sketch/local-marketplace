import Skeleton, { SkeletonButton, SkeletonText } from "@/components/shared/Skeleton";

const STEP_COUNT = 7;
const SECTION_COUNT = 6;

// Layout-matched skeleton for the Product Editor (components/admin/ProductForm.tsx
// + ProductEditorChrome.tsx) — shared by both /admin/products/[id]/edit and
// /brand-portal/products/[id]/edit, since both render the same ProductForm.
// Reproduces the real chrome instead of falling through to the generic
// DashboardLoading skeleton: sticky header with the 7-step stepper, the
// two-column body (numbered section cards + Live Preview), and the sticky
// bottom action bar — same structure, same proportions, same breakpoints.
export default function ProductEditorSkeleton({ isBrandPortal = false }: { isBrandPortal?: boolean }) {
  return (
    <div aria-label="Loading product editor" aria-busy="true">
      {/* Sticky header: back link, title/status, save-state row, stepper, actions */}
      <header className="sticky top-[72px] z-30 -mx-4 mb-6 space-y-2.5 border-y border-stone-150 bg-cream/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:-mx-10 xl:px-10">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-5 w-32" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton variant="text" className="h-5 w-48" />
            <Skeleton variant="text" className="h-3 w-28" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            {Array.from({ length: STEP_COUNT }).map((_, index) => (
              <Skeleton key={index} className="h-7 w-24 shrink-0 rounded-full" />
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!isBrandPortal && <SkeletonButton width={120} className="hidden h-10 sm:block" />}
            <SkeletonButton width={140} className="h-10" />
          </div>
        </div>
      </header>

      {/* Two-column body: numbered section cards (left) + Live Preview (right) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(420px,1.08fr)_minmax(390px,0.92fr)]">
        <div className="space-y-5">
          {Array.from({ length: SECTION_COUNT }).map((_, index) => (
            <SectionCardSkeleton key={index} />
          ))}
        </div>
        <div className="xl:sticky xl:top-[158px] xl:h-[calc(100vh-174px)]">
          <div className="h-full min-h-[420px] rounded-2xl border border-stone-150 bg-white p-5">
            <Skeleton variant="text" className="h-3 w-32" />
            <Skeleton className="mt-4 aspect-[4/5] w-full" />
            <SkeletonText lines={2} className="mt-4" />
          </div>
        </div>
      </div>

      {/* Sticky bottom action bar (mobile) */}
      <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 border-t border-stone-150 bg-cream/95 px-4 py-3 backdrop-blur lg:static lg:rounded-xl lg:border">
        <Skeleton variant="text" className="h-3 w-28" />
        <div className="flex gap-2">
          {!isBrandPortal && <SkeletonButton width={110} className="h-10" />}
          <SkeletonButton width={130} className="h-10" />
        </div>
      </div>
    </div>
  );
}

function SectionCardSkeleton() {
  return (
    <div className="rounded-2xl border border-stone-150 bg-white p-5">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
        <Skeleton variant="text" className="h-4 w-40" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
    </div>
  );
}
