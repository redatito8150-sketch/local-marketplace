import { CreditCard } from "lucide-react";

export default function PaymentMethodsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Payment Methods</h1>
      <p className="mt-1 text-[13.5px] text-ink-soft/60">
        Saved payment methods for faster checkout.
      </p>

      <div className="mt-8 flex flex-col items-center justify-center rounded-xl3 border border-dashed border-stone-200 bg-white px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-beige-100">
          <CreditCard className="h-6 w-6 text-ink-soft/60" strokeWidth={1.6} />
        </div>
        <p className="mt-5 text-[15px] font-medium text-ink">Coming soon</p>
        <p className="mt-1.5 max-w-xs text-[13px] text-ink-soft/60">
          Saved payment methods will be available once online payments launch.
        </p>
      </div>
    </div>
  );
}
