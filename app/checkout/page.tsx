"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Banknote, Truck, PartyPopper, ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { formatSize } from "@/lib/format";
import type { AddressLabel, AddressRecord } from "@/types";

type Step = "shipping" | "payment" | "confirmation";

const STEPS: { id: Step; label: string }[] = [
  { id: "shipping", label: "Shipping" },
  { id: "payment", label: "Payment" },
  { id: "confirmation", label: "Confirmation" },
];

interface ShippingForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  governorate: string;
}

const EMPTY_SHIPPING: ShippingForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  governorate: "",
};

function addressToShipping(address: AddressRecord, fallbackEmail: string): ShippingForm {
  return {
    firstName: address.firstName,
    lastName: address.lastName,
    email: fallbackEmail,
    phone: address.phone,
    address: address.addressLine,
    city: address.city,
    governorate: address.governorate,
  };
}

const NEW_ADDRESS = "__new__";

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("shipping");
  const [orderNumber, setOrderNumber] = useState("");
  const [shipping, setShipping] = useState<ShippingForm>(EMPTY_SHIPPING);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  // Saved addresses for a signed-in shopper — lets checkout offer a real
  // selector instead of just prefilling the default into a flat form.
  const [savedAddresses, setSavedAddresses] = useState<AddressRecord[]>([]);
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(NEW_ADDRESS);
  const [saveNewAddress, setSaveNewAddress] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState<AddressLabel>("Home");

  useEffect(() => {
    // addressesLoaded is only ever read alongside `user &&` in the JSX
    // below, so a guest (no user) has nothing that depends on it — no
    // need to fetch or set state here at all.
    if (!user) return;
    let cancelled = false;
    fetch("/api/account/addresses")
      .then((res) => (res.ok ? res.json() : { addresses: [] }))
      .then((data: { addresses: AddressRecord[] }) => {
        if (cancelled) return;
        const addresses = data.addresses ?? [];
        setSavedAddresses(addresses);
        const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
        if (defaultAddress) {
          setSelectedAddressId(defaultAddress.id);
          setShipping(addressToShipping(defaultAddress, user.email ?? ""));
        } else {
          setShipping((s) => ({ ...s, email: user.email ?? s.email }));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAddressesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally runs once per signed-in session, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const selectSavedAddress = (address: AddressRecord) => {
    setSelectedAddressId(address.id);
    setShipping((s) => addressToShipping(address, s.email));
  };

  const selectNewAddress = () => {
    setSelectedAddressId(NEW_ADDRESS);
    setShipping((s) => ({ ...EMPTY_SHIPPING, email: s.email }));
  };

  const [couponInput, setCouponInput] = useState("");
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountEgp: number } | null>(
    null
  );

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const goToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("payment");
  };

  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponChecking(true);
    setCouponError("");
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponInput, subtotalEgp: subtotal.egp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponError(data.error ?? "This code isn't valid");
        setAppliedCoupon(null);
        return;
      }
      setAppliedCoupon({ code: data.code, discountEgp: data.discountEgp });
    } catch {
      setCouponError("Couldn't check that code — please try again.");
    } finally {
      setCouponChecking(false);
    }
  };

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlacing(true);
    setError("");

    try {
      // Using a saved address as-is → pass its id straight through.
      // Typing a brand-new one with "save to my account" checked → create
      // it first so the order can reference a real address id; left
      // unchecked (or for guests, who have nowhere to save to) the order
      // just uses the flat shipping fields with no addressId at all.
      let addressId: string | undefined =
        selectedAddressId !== NEW_ADDRESS ? selectedAddressId : undefined;

      if (selectedAddressId === NEW_ADDRESS && user && saveNewAddress) {
        const saveRes = await fetch("/api/account/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: newAddressLabel,
            firstName: shipping.firstName,
            lastName: shipping.lastName,
            phone: shipping.phone,
            addressLine: shipping.address,
            city: shipping.city,
            governorate: shipping.governorate,
          }),
        });
        if (saveRes.ok) {
          const saved = await saveRes.json();
          addressId = saved.id;
        }
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.productId,
            size: item.size,
            color: item.color,
            quantity: item.quantity,
          })),
          shipping,
          couponCode: appliedCoupon?.code,
          addressId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong placing your order.");
        return;
      }

      setOrderNumber(data.orderNumber);
      clearCart();
      setStep("confirmation");
    } catch {
      setError("Something went wrong placing your order. Please try again.");
    } finally {
      setPlacing(false);
    }
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

                {user && addressesLoaded && savedAddresses.length > 0 && (
                  <div className="space-y-2.5">
                    {savedAddresses.map((address) => (
                      <label
                        key={address.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 transition-colors ${
                          selectedAddressId === address.id
                            ? "border-ink bg-white"
                            : "border-stone-150 bg-white/60 hover:border-ink/30"
                        }`}
                      >
                        <input
                          type="radio"
                          name="savedAddress"
                          className="mt-1"
                          checked={selectedAddressId === address.id}
                          onChange={() => selectSavedAddress(address)}
                        />
                        <span className="text-[13px] text-ink">
                          <span className="font-semibold">{address.label}</span>
                          {address.isDefault && (
                            <span className="ml-2 text-[11px] font-medium text-ink-soft/50">
                              Default
                            </span>
                          )}
                          <br />
                          {address.firstName} {address.lastName} · {address.phone}
                          <br />
                          {address.addressLine}, {address.city}, {address.governorate}
                        </span>
                      </label>
                    ))}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-[13px] font-medium transition-colors ${
                        selectedAddressId === NEW_ADDRESS
                          ? "border-ink bg-white text-ink"
                          : "border-dashed border-stone-150 bg-white/60 text-ink-soft/70 hover:border-ink/30"
                      }`}
                    >
                      <input
                        type="radio"
                        name="savedAddress"
                        checked={selectedAddressId === NEW_ADDRESS}
                        onChange={selectNewAddress}
                      />
                      Use a new address
                    </label>
                  </div>
                )}

                <Field
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  value={shipping.email}
                  onChange={(v) => setShipping((s) => ({ ...s, email: v }))}
                />

                {selectedAddressId === NEW_ADDRESS && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <Field
                        label="First name"
                        placeholder="Nour"
                        required
                        value={shipping.firstName}
                        onChange={(v) => setShipping((s) => ({ ...s, firstName: v }))}
                      />
                      <Field
                        label="Last name"
                        placeholder="Ahmed"
                        required
                        value={shipping.lastName}
                        onChange={(v) => setShipping((s) => ({ ...s, lastName: v }))}
                      />
                    </div>
                    <Field
                      label="Phone"
                      type="tel"
                      placeholder="+20 10 000 0000"
                      required
                      value={shipping.phone}
                      onChange={(v) => setShipping((s) => ({ ...s, phone: v }))}
                    />
                    <Field
                      label="Address"
                      placeholder="Street, building, apartment"
                      required
                      value={shipping.address}
                      onChange={(v) => setShipping((s) => ({ ...s, address: v }))}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <Field
                        label="City"
                        placeholder="Cairo"
                        required
                        value={shipping.city}
                        onChange={(v) => setShipping((s) => ({ ...s, city: v }))}
                      />
                      <Field
                        label="Governorate"
                        placeholder="Cairo"
                        required
                        value={shipping.governorate}
                        onChange={(v) => setShipping((s) => ({ ...s, governorate: v }))}
                      />
                    </div>

                    {user && (
                      <div className="space-y-2 rounded-md border border-stone-150 bg-white p-4">
                        <label className="flex items-center gap-2 text-[13px] font-medium text-ink">
                          <input
                            type="checkbox"
                            checked={saveNewAddress}
                            onChange={(e) => setSaveNewAddress(e.target.checked)}
                          />
                          Save this address to my account
                        </label>
                        {saveNewAddress && (
                          <label className="block max-w-[160px]">
                            <span className="text-[12px] text-ink-soft/60">Label</span>
                            <select
                              value={newAddressLabel}
                              onChange={(e) => setNewAddressLabel(e.target.value as AddressLabel)}
                              className="mt-1 w-full rounded-md border border-stone-150 bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink/30"
                            >
                              <option value="Home">Home</option>
                              <option value="Work">Work</option>
                              <option value="Other">Other</option>
                            </select>
                          </label>
                        )}
                        <p className="text-[12px] text-ink-soft/50">
                          {saveNewAddress
                            ? "This will be added to your saved addresses."
                            : "Leave unchecked to use this address for this order only."}
                        </p>
                      </div>
                    )}
                  </>
                )}

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

                <div className="rounded-md border border-stone-150 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-ink-soft/60" strokeWidth={1.6} />
                    <span className="text-[13px] font-semibold text-ink">
                      Cash on delivery
                    </span>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft/65">
                    Pay when your order arrives. Online card payments are not available yet,
                    and no payment details are collected on this page.
                  </p>
                </div>

                {error && (
                  <p className="rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={placing}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-ink py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {placing ? "Placing Order…" : "Place Cash on Delivery Order"}
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
                        Qty {item.quantity} · {formatSize(item.size)}
                      </p>
                    </div>
                    <p className="text-[13px] font-semibold text-ink">
                      {item.currency === "EGP"
                        ? `${(item.price * item.quantity).toLocaleString("en-US")} EGP`
                        : `$${(item.price * item.quantity).toFixed(2)}`}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 border-t border-stone-150 pt-4">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between rounded-md bg-green-50 px-3 py-2 text-[12.5px] font-medium text-green-700">
                    <span>Code &quot;{appliedCoupon.code}&quot; applied</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedCoupon(null);
                        setCouponInput("");
                      }}
                      className="text-[11.5px] underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="Discount code"
                      className="min-w-0 flex-1 rounded-md border border-stone-150 bg-white px-3 py-2 text-[13px] uppercase text-ink outline-none focus:border-ink/30"
                    />
                    <button
                      type="button"
                      onClick={applyCoupon}
                      disabled={couponChecking || !couponInput.trim()}
                      className="rounded-md border border-stone-150 bg-white px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-stone-100 disabled:opacity-60"
                    >
                      {couponChecking ? "…" : "Apply"}
                    </button>
                  </div>
                )}
                {couponError && (
                  <p className="mt-1.5 text-[12px] text-red-600">{couponError}</p>
                )}
              </div>

              <div className="mt-4 space-y-2 border-t border-stone-150 pt-4 text-[13.5px] text-ink-soft/75">
                {subtotal.usd > 0 && (
                  <div className="flex items-center justify-between">
                    <span>Total (USD)</span>
                    <span className="font-semibold text-ink">
                      ${subtotal.usd.toFixed(2)}
                    </span>
                  </div>
                )}
                {subtotal.egp > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <span>Subtotal (EGP)</span>
                      <span className="font-medium text-ink">
                        {subtotal.egp.toLocaleString("en-US")} EGP
                      </span>
                    </div>
                    {appliedCoupon && appliedCoupon.discountEgp > 0 && (
                      <div className="flex items-center justify-between text-green-700">
                        <span>Discount</span>
                        <span className="font-medium">
                          -{appliedCoupon.discountEgp.toLocaleString("en-US")} EGP
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-ink">
                      <span className="font-semibold">Total (EGP)</span>
                      <span className="font-semibold">
                        {(subtotal.egp - (appliedCoupon?.discountEgp ?? 0)).toLocaleString("en-US")}{" "}
                        EGP
                      </span>
                    </div>
                  </>
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
  value,
  onChange,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-ink/30"
      />
    </label>
  );
}
