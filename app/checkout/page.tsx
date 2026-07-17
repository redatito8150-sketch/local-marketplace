"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CreditCard, Truck, PartyPopper, ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";

type Step = "shipping" | "payment" | "confirmation";

const STEPS: { id: Step; label: string }[] = [
  { id: "shipping", label: "Shipping" },
  { id: "payment", label: "Payment" },
  { id: "confirmation", label: "Confirmation" },
];

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const [step, setStep] = useState<Step>("shipping");
  const [orderNumber, setOrderNumber] = useState("");

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const goToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("payment");
  };

  const placeOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setOrderNumber(`LC-${Math.floor(100000 + Math.random() * 900000)}`);
    clearCart();
    setStep("confirmation");
  };

  if (items.length === 0 && step !== "confirmation") {
    return (
      <main className="min-h-screen bg-cream">
        <Header />
        <section className="mx-auto max-w-screen2xl px-8 py-20 text-center lg:px-12">
          <p className="text-lg font-medium text-ink">Your cart is empty</p>
          <Link
            href="/shop/women"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream"
          >
            Start Shopping
          </Link>
        </section>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-cream">
      <Header />

      <section className="mx-auto max-w-screen2xl px-8 py-12 lg:px-12 lg:py-16">
        {/* Step indicator */}
        <div className="mb-10 flex items-center gap-3">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold transition-colors ${
                  i < stepIndex
                    ? "bg-ink text-cream"
                    : i === stepIndex
                    ? "border-2 border-ink text-ink"
                    : "border border-stone-150 text-ink-soft/40"
                }`}
              >
                {i < stepIndex ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
              </div>
              <span
                className={`text-[13px] font-medium ${
                  i <= stepIndex ? "text-ink" : "text-ink-soft/40"
                }`}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className="h-px w-10 bg-stone-150 sm:w-16" />
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_340px]">
          <div>
            {step === "shipping" && (
              <form onSubmit={goToPayment} className="max-w-lg space-y-5">
                <h1 className="text-2xl font-bold tracking-tightest text-ink">
                  Shipping Information
                </h1>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="First name" placeholder="Nour" required />
                  <Field label="Last name" placeholder="Ahmed" required />
                </div>
                <Field label="Email" type="email" placeholder="you@example.com" required />
                <Field label="Phone" type="tel" placeholder="+20 10 000 0000" required />
                <Field label="Address" placeholder="Street, building, apartment" required />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="City" placeholder="Cairo" required />
                  <Field label="Governorate" placeholder="Cairo" required />
                </div>

                <button
                  type="submit"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-ink py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01]"
                >
                  Continue to Payment
                </button>
              </form>
            )}

            {step === "payment" && (
              <form onSubmit={placeOrder} className="max-w-lg space-y-5">
                <button
                  type="button"
                  onClick={() => setStep("shipping")}
                  className="mb-2 flex items-center gap-1.5 text-[13px] text-ink-soft/60 hover:text-ink"
                >
                  <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
                  Back to shipping
                </button>
                <h1 className="text-2xl font-bold tracking-tightest text-ink">
                  Payment
                </h1>

                <div className="flex items-center gap-2 rounded-md border border-stone-150 bg-white p-3.5">
                  <CreditCard className="h-4 w-4 text-ink-soft/60" strokeWidth={1.6} />
                  <span className="text-[13px] font-medium text-ink">
                    Card payment (demo — no real charge will be made)
                  </span>
                </div>

                <Field label="Card number" placeholder="4242 4242 4242 4242" required />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Expiry" placeholder="MM/YY" required />
                  <Field label="CVC" placeholder="123" required />
                </div>
                <Field label="Name on card" placeholder="Nour Ahmed" required />

                <button
                  type="submit"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-ink py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01]"
                >
                  Place Order
                </button>
              </form>
            )}

            {step === "confirmation" && (
              <div className="flex max-w-lg flex-col items-start py-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-cream">
                  <PartyPopper className="h-6 w-6" strokeWidth={1.8} />
                </div>
                <h1 className="mt-6 text-2xl font-bold tracking-tightest text-ink">
                  Order confirmed
                </h1>
                <p className="mt-2 text-[14px] text-ink-soft/70">
                  Thank you — your order{" "}
                  <span className="font-semibold text-ink">#{orderNumber}</span> has
                  been placed. A confirmation email is on its way.
                </p>
                <Link
                  href="/"
                  className="mt-7 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream transition-transform hover:scale-[1.03]"
                >
                  Continue Shopping
                </Link>
              </div>
            )}
          </div>

          {/* Order summary sidebar */}
          {step !== "confirmation" && (
            <div className="h-fit rounded-xl3 bg-stone-50 p-7">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <Truck className="h-4 w-4 text-ink-soft/60" strokeWidth={1.6} />
                Order Summary
              </h2>
              <div className="mt-5 space-y-3 divide-y divide-stone-150">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between pt-3 first:pt-0">
                    <div>
                      <p className="text-[13px] font-medium text-ink">{item.name}</p>
                      <p className="text-[12px] text-ink-soft/50">
                        Qty {item.quantity} · {item.size}
                      </p>
                    </div>
                    <p className="text-[13px] font-semibold text-ink">
                      {item.currency === "EGP"
                        ? `${(item.price * item.quantity).toLocaleString()} EGP`
                        : `$${(item.price * item.quantity).toFixed(2)}`}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-2 border-t border-stone-150 pt-4 text-[13.5px] text-ink-soft/75">
                {subtotal.usd > 0 && (
                  <div className="flex items-center justify-between">
                    <span>Total (USD)</span>
                    <span className="font-semibold text-ink">
                      ${subtotal.usd.toFixed(2)}
                    </span>
                  </div>
                )}
                {subtotal.egp > 0 && (
                  <div className="flex items-center justify-between">
                    <span>Total (EGP)</span>
                    <span className="font-semibold text-ink">
                      {subtotal.egp.toLocaleString()} EGP
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}

function Field({
  label,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        required={required}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-ink/30"
      />
    </label>
  );
}
