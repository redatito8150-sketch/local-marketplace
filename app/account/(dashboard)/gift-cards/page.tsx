import CouponCheckForm from "@/components/account/CouponCheckForm";

export default function GiftCardsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Gift Cards</h1>
      <p className="mt-1 max-w-lg text-[13.5px] text-ink-soft/60">
        LOCAL doesn&apos;t issue standalone gift card balances yet — check
        whether a discount code is currently valid and see what it would take
        off your order.
      </p>

      <div className="mt-8">
        <CouponCheckForm />
      </div>
    </div>
  );
}
