export default function Loading() {
  return (
    <div className="min-h-screen animate-pulse bg-cream">
      <div className="h-16 border-b border-stone-150 bg-stone-50" />
      <div className="mx-auto max-w-screen3xl px-8 lg:px-[60px]">
        <div className="mt-6 h-[250px] w-full rounded-[20px] bg-stone-100" />
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[112px] rounded-[18px] bg-stone-100" />
          ))}
        </div>
        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="h-[400px] rounded-lg bg-stone-100" />
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-[3/3.9] rounded-[16px] bg-stone-100" />
                <div className="mt-3 h-3 w-2/3 rounded bg-stone-100" />
                <div className="mt-2 h-3 w-1/2 rounded bg-stone-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
