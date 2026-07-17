export default function Loading() {
  return (
    <div className="min-h-screen animate-pulse bg-cream">
      <div className="h-16 border-b border-stone-150 bg-stone-50" />
      <div className="mx-auto max-w-screen2xl px-8 py-10 lg:px-12">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div className="aspect-[4/5] w-full rounded-xl3 bg-stone-100" />
          <div>
            <div className="h-3 w-24 rounded bg-stone-100" />
            <div className="mt-4 h-8 w-3/4 rounded bg-stone-100" />
            <div className="mt-4 h-6 w-1/4 rounded bg-stone-100" />
            <div className="mt-8 h-10 w-full rounded bg-stone-100" />
            <div className="mt-4 h-10 w-full rounded bg-stone-100" />
            <div className="mt-8 h-12 w-full rounded bg-stone-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
