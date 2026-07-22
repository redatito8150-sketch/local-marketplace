"use client";

export default function ShopAllError({ reset }: { error: Error; reset: () => void }) {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center bg-cream px-6 text-center"><h1 className="font-serif text-3xl font-semibold text-ink">We couldn’t load the marketplace</h1><p className="mt-3 max-w-md text-sm text-ink-soft/65">Please try again. Your filters are still in the address bar.</p><button type="button" onClick={reset} className="mt-6 rounded-full bg-mahalyred px-6 py-3 text-sm font-bold text-white">Try again</button></div>;
}
