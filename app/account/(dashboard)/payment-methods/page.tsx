import { CreditCard } from "lucide-react";
import { AccountPageHeader, AccountPanel } from "@/components/account/AccountUI";

export default function PaymentMethodsPage() {
  return (
    <div className="space-y-7">
      <AccountPageHeader eyebrow="Checkout" title="Payment methods" description="Saved online payment methods will appear here when online payments become available." />
      <AccountPanel>
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--account-surface-muted)]">
          <CreditCard className="h-6 w-6 text-[var(--account-accent)]" strokeWidth={1.6} />
        </div>
        <p className="mt-5 text-[15px] font-medium text-[var(--account-text)]">Coming soon</p>
        <p className="mt-1.5 max-w-xs text-[13px] text-[var(--account-text-muted)]">
          Saved payment methods will be available once online payments launch.
        </p>
      </div>
      </AccountPanel>
    </div>
  );
}
