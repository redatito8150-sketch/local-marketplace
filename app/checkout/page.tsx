"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { Check, Banknote, CreditCard, Truck, PartyPopper, ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { formatSize } from "@/lib/format";
import { useShippingPreview } from "@/lib/hooks/useShippingPreview";
import { groupItemsByFulfillment, shipmentShippingFee } from "@/lib/cart/fulfillmentGroups";
import { fetchWithAppError } from "@/lib/errors/client";
import { makeAppError } from "@/lib/errors/appError";
import InlineError from "@/components/shared/InlineError";
import FieldError from "@/components/shared/FieldError";
import {
  cardPaymentReducer,
  INITIAL_CARD_PAYMENT_STATE,
} from "@/lib/payments/cardPaymentAttempt";
import {
  loadPaymobPixel,
  PAYMOB_PIXEL_CONTAINER_ID,
  type PaymobPixelInstance,
} from "@/lib/payments/paymobPixelLoader";
import type { AddressLabel, AddressRecord, AppError } from "@/types";

// Only set once the owner has configured a real Paymob publishable key
// (see .env.local.example) — until then the "Pay by card" option simply
// doesn't render, same "never show a button that isn't wired up yet"
// convention as NEXT_PUBLIC_AUTH_GOOGLE_ENABLED. Cash on Delivery is
// completely unaffected either way.
const PAYMOB_PUBLIC_KEY = process.env.NEXT_PUBLIC_PAYMOB_PUBLIC_KEY;
const CARD_PAYMENT_ENABLED = Boolean(PAYMOB_PUBLIC_KEY);

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
  const [orderNumbers, setOrderNumbers] = useState<string[]>([]);
  const { partnerFlagsBySlug, shippingSettings } = useShippingPreview(
    items.map((i) => i.brandSlug).filter(Boolean)
  );
  const shipmentGroups = groupItemsByFulfillment(items, partnerFlagsBySlug);
  const totalShippingEgp = shipmentGroups.reduce(
    (sum, g) =>
      sum +
      shipmentShippingFee(g, shippingSettings.flatDeliveryFeeEgp, shippingSettings.freeShippingThresholdEgp),
    0
  );
  const [shipping, setShipping] = useState<ShippingForm>(EMPTY_SHIPPING);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const orderIdempotencyKeyRef = useRef<string | null>(null);

  // Card payment (Paymob Pixel) — kept entirely separate from the COD state
  // above. Cash on Delivery's own form/handlers below are untouched by any
  // of this.
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "card">("cod");
  const [cardState, dispatchCard] = useReducer(cardPaymentReducer, INITIAL_CARD_PAYMENT_STATE);
  // Synchronous double-click guard — checked and set before any state
  // dispatch or await, so it's safe even across two click events that land
  // before React has re-rendered the (also-disabled) button in between.
  const cardRequestInFlightRef = useRef(false);
  const pixelInstanceRef = useRef<PaymobPixelInstance | null>(null);
  // Latches true the first time a Pixel mount is attempted, and never
  // resets — this is what keeps the container div (below) permanently in
  // the DOM once Pixel has ever mounted into it, rather than letting React
  // remove/recreate it across phase changes. State, not a ref, since it's
  // read during render (refs can only be read in effects/handlers).
  const [pixelMountEverStarted, setPixelMountEverStarted] = useState(false);

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

    const result = await fetchWithAppError<{ code: string; discountEgp: number }>("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: couponInput, subtotalEgp: subtotal.egp }),
    });
    setCouponChecking(false);

    if (!result.ok) {
      setCouponError(result.error.userMessage);
      setAppliedCoupon(null);
      return;
    }
    setAppliedCoupon({ code: result.data.code, discountEgp: result.data.discountEgp });
  };

  // Card payment — launches Paymob's Pixel embedded checkout via the
  // existing POST /api/payments/paymob/intention endpoint. This function
  // ONLY ever calls that one endpoint; it never creates an order, never
  // touches place_order, and never marks anything paid — see
  // lib/payments/cardPaymentAttempt.ts's module comment for why that
  // invariant is enforced at the state-machine level, not just here.
  const startCardAttempt = useCallback(async () => {
    if (cardRequestInFlightRef.current) return;
    if (cardState.phase !== "idle" && cardState.phase !== "cancelled" && cardState.phase !== "error") return;

    cardRequestInFlightRef.current = true;
    // A fresh UUID per logical attempt — reused for the whole in-flight
    // request (never regenerated by a re-render), and only ever minted
    // again once the user explicitly starts a new attempt from a
    // cancelled/failed state (see cardPaymentReducer's RESTARTABLE_PHASES).
    const idempotencyKey = crypto.randomUUID();
    dispatchCard({ type: "START_ATTEMPT", idempotencyKey });

    try {
      const result = await fetchWithAppError<{ clientSecret: string; paymentAttemptId: string }>(
        "/api/payments/paymob/intention",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            items: items.map((item) => ({
              productId: item.productId,
              size: item.size,
              color: item.color,
              quantity: item.quantity,
            })),
            shipping,
            couponCode: appliedCoupon?.code,
          }),
        }
      );

      if (!result.ok) {
        dispatchCard({ type: "INTENTION_FAILED", error: result.error });
        return;
      }
      dispatchCard({
        type: "INTENTION_SUCCEEDED",
        clientSecret: result.data.clientSecret,
        paymentAttemptId: result.data.paymentAttemptId,
      });
    } finally {
      cardRequestInFlightRef.current = false;
    }
    // items/shipping/appliedCoupon MUST stay in this dependency array —
    // useCallback only rebuilds the closure when a dep changes, and
    // cardState.phase stays "idle" through the entire Shipping step, so
    // without these deps this closes over whatever shipping/items were at
    // first render (usually the empty initial shipping form) rather than
    // what the customer actually filled in or selected before clicking
    // Pay with Card. Was previously [cardState.phase] only — caused every
    // card attempt to send an empty shipping.firstName.
  }, [cardState.phase, items, shipping, appliedCoupon]);

  // Mounts Paymob Pixel once a client_secret is available, and keeps it
  // mounted through "ready" -> "pixel_open" (that transition only clears
  // clientSecret/marks the instance as created — it isn't a reason to tear
  // anything down). Depending on the derived pixelActive boolean rather
  // than cardState.phase/clientSecret directly is deliberate: those two
  // change together the instant PIXEL_MOUNTED fires, which previously
  // re-ran this effect (and its cleanup) immediately after mounting,
  // unmounting the widget the moment it was created. Cleanup now only
  // fires when the customer actually leaves the ready/pixel_open pair
  // (cancelled/error/confirming) — e.g. if they switch back to Cash on
  // Delivery mid-flow.
  const pixelActive = cardState.phase === "ready" || cardState.phase === "pixel_open";
  useEffect(() => {
    if (!pixelActive) return;
    if (pixelInstanceRef.current) return; // already mounted for this attempt
    if (!cardState.clientSecret) return; // pixel_open re-entry — nothing to (re)mount

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPixelMountEverStarted(true);
    let cancelled = false;
    const clientSecret = cardState.clientSecret;

    if (!PAYMOB_PUBLIC_KEY) {
      dispatchCard({
        type: "PIXEL_ERROR",
        error: makeAppError("server_unavailable", {
          userMessage: "Card payment is temporarily unavailable. Please try Cash on Delivery.",
        }),
      });
      return;
    }

    loadPaymobPixel()
      .then((PixelConstructor) => {
        if (cancelled) return;
        const instance = new PixelConstructor({
          publicKey: PAYMOB_PUBLIC_KEY,
          clientSecret,
          paymentMethods: ["card"],
          elementId: PAYMOB_PIXEL_CONTAINER_ID,
          onCancel: () => dispatchCard({ type: "PIXEL_CANCELLED" }),
          onError: () =>
            dispatchCard({
              type: "PIXEL_ERROR",
              error: makeAppError("external_provider", {
                userMessage:
                  "Something went wrong with the payment form. Please try again or use Cash on Delivery.",
              }),
            }),
        });
        pixelInstanceRef.current = instance;
        dispatchCard({ type: "PIXEL_MOUNTED" });
      })
      .catch(() => {
        if (cancelled) return;
        dispatchCard({
          type: "PIXEL_ERROR",
          error: makeAppError("external_provider", {
            userMessage: "We couldn't load the payment form. Please try again or use Cash on Delivery.",
          }),
        });
      });

    return () => {
      cancelled = true;
      pixelInstanceRef.current?.unmount();
      pixelInstanceRef.current = null;
    };
    // cardState.clientSecret is deliberately excluded — see the comment
    // above pixelActive. Including it would restore the exact premature-
    // unmount bug this effect was rewritten to fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelActive]);

  // Confirmation polling — the ONLY path that can ever move the UI to a
  // "confirmed" state. This never reads anything from Pixel; it reads our
  // own backend's payment_attempts status (GET /api/payments/paymob/
  // attempts/[id]), whose status column is itself only ever written by the
  // HMAC-verified webhook (see supabase/migrations/
  // 20260812000001_paymob_webhook_and_paid_fulfillment.sql). Polling is
  // purely a display mechanism for a fact the backend already established
  // — the browser is not deciding anything here.
  useEffect(() => {
    if (cardState.phase !== "pixel_open" && cardState.phase !== "confirming") return;
    if (!cardState.paymentAttemptId) return;

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 40; // ~2 minutes at 3s intervals
    const paymentAttemptId = cardState.paymentAttemptId;

    const poll = async () => {
      attempts += 1;
      const result = await fetchWithAppError<{
        status: string;
        orderGroupId: string | null;
        isPartial: boolean;
      }>(`/api/payments/paymob/attempts/${paymentAttemptId}`);

      if (cancelled) return;

      if (!result.ok) {
        // A transient read failure isn't itself a payment failure — keep
        // polling (up to the cap) rather than surfacing a scary error for
        // what might just be a dropped network request.
        if (attempts >= MAX_ATTEMPTS) {
          dispatchCard({ type: "POLL_PENDING" });
        }
        return;
      }

      const { status, orderGroupId, isPartial } = result.data;
      if (status === "fulfilled") {
        dispatchCard({ type: "POLL_CONFIRMED", orderGroupId, isPartial });
      } else if (status === "fulfillment_failed" || status === "failed" || status === "expired" || status === "cancelled") {
        dispatchCard({
          type: "POLL_FAILED",
          error: makeAppError("external_provider", {
            userMessage:
              status === "fulfillment_failed"
                ? "Your payment went through, but we couldn't complete your order. Our team has been notified and will follow up by email."
                : "This card payment didn't succeed. Please try again or use Cash on Delivery.",
          }),
        });
      } else if (status !== "created") {
        // "created" means the customer hasn't submitted the card form yet
        // — the very first poll (fired ~immediately after the form opens)
        // would otherwise always be "created", incorrectly dispatching
        // POLL_PENDING (which moves the UI to "confirming", hiding the
        // form) within about a second of it appearing, before the
        // customer could plausibly have entered anything. Only a status
        // that indicates Paymob has actually started processing something
        // (pending/processing) is a real reason to leave pixel_open.
        dispatchCard({ type: "POLL_PENDING" });
      }
    };

    void poll();
    const interval = setInterval(() => {
      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(interval);
        return;
      }
      void poll();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [cardState.phase, cardState.paymentAttemptId]);

  // Cart-clearing for card payments — happens ONLY once polling has
  // confirmed real fulfillment (an authoritative backend fact), never on
  // any Pixel signal, and only once per attempt (guarded so a re-render
  // while already "confirmed" can't call clearCart repeatedly).
  const cardCartClearedRef = useRef(false);
  useEffect(() => {
    if (cardState.phase !== "confirmed") {
      cardCartClearedRef.current = false;
      return;
    }
    if (cardCartClearedRef.current) return;
    cardCartClearedRef.current = true;
    clearCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardState.phase]);

  const submitOrder = async () => {
    setPlacing(true);
    setError(null);

    // Using a saved address as-is → pass its id straight through. Typing a
    // brand-new one with "save to my account" checked → create it first so
    // the order can reference a real address id; left unchecked (or for
    // guests, who have nowhere to save to) the order just uses the flat
    // shipping fields with no addressId at all.
    let addressId: string | undefined =
      selectedAddressId !== NEW_ADDRESS ? selectedAddressId : undefined;

    if (selectedAddressId === NEW_ADDRESS && user && saveNewAddress) {
      const saveResult = await fetchWithAppError<{ id: string }>("/api/account/addresses", {
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
      // Saving the address is a convenience, not a requirement for placing
      // this order — if it fails, silently fall through to the flat
      // shipping fields rather than blocking checkout over it.
      if (saveResult.ok) addressId = saveResult.data.id;
    }

    const idempotencyKey =
      orderIdempotencyKeyRef.current ?? crypto.randomUUID();
    orderIdempotencyKeyRef.current = idempotencyKey;
    const orderResult = await fetchWithAppError<{ orderNumbers: string[] }>("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
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

    setPlacing(false);
    if (!orderResult.ok) {
      setError(orderResult.error);
      return;
    }

    setOrderNumbers(orderResult.data.orderNumbers ?? []);
    orderIdempotencyKeyRef.current = null;
    clearCart();
    setStep("confirmation");
  };

  const placeOrder = (e: React.FormEvent) => {
    e.preventDefault();
    void submitOrder();
  };

  if (items.length === 0 && step !== "confirmation") {
    return (
      <main className="flex min-h-screen flex-col [&>*]:w-full bg-cream">
        <Header />
        <section className="mx-auto max-w-screen2xl px-8 py-20 text-center lg:px-12">
          <p className="text-lg font-medium text-ink">Your cart is empty</p>
          <Link
            href="/shop/women"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-mahalyred px-6 py-3 text-sm font-semibold text-cream"
          >
            Start Shopping
          </Link>
        </section>
        <Footer />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col [&>*]:w-full bg-cream">
      <Header />

      <section className="mx-auto max-w-screen2xl px-8 py-12 lg:px-12 lg:py-16">
        {/* Step indicator */}
        <div className="mb-10 flex items-center gap-3">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold transition-colors ${
                  i < stepIndex
                    ? "bg-mahalyred text-cream"
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
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-mahalyred py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01]"
                >
                  Continue to Payment
                </button>
              </form>
            )}

            {step === "payment" && (
              <div className="max-w-lg space-y-5">
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

                {CARD_PAYMENT_ENABLED && (
                  <div className="space-y-2.5">
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition-colors ${
                        paymentMethod === "cod"
                          ? "border-ink bg-white"
                          : "border-stone-150 bg-white/60 hover:border-ink/30"
                      }`}
                    >
                      <input
                        type="radio"
                        name="checkoutPaymentMethod"
                        checked={paymentMethod === "cod"}
                        onChange={() => setPaymentMethod("cod")}
                      />
                      <Banknote className="h-4 w-4 text-ink-soft/60" strokeWidth={1.6} />
                      <span className="text-[13px] font-semibold text-ink">Cash on delivery</span>
                    </label>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition-colors ${
                        paymentMethod === "card"
                          ? "border-ink bg-white"
                          : "border-stone-150 bg-white/60 hover:border-ink/30"
                      }`}
                    >
                      <input
                        type="radio"
                        name="checkoutPaymentMethod"
                        checked={paymentMethod === "card"}
                        onChange={() => setPaymentMethod("card")}
                      />
                      <CreditCard className="h-4 w-4 text-ink-soft/60" strokeWidth={1.6} />
                      <span className="text-[13px] font-semibold text-ink">Pay by card</span>
                    </label>
                  </div>
                )}

                {paymentMethod === "cod" && (
                  <form onSubmit={placeOrder} className="space-y-5">
                    <div className="rounded-md border border-stone-150 bg-white p-4">
                      <div className="flex items-center gap-2">
                        <Banknote className="h-4 w-4 text-ink-soft/60" strokeWidth={1.6} />
                        <span className="text-[13px] font-semibold text-ink">
                          Cash on delivery
                        </span>
                      </div>
                      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft/65">
                        Pay when your order arrives. No payment details are collected on this page.
                      </p>
                    </div>

                    {error && <InlineError error={error} onRetry={submitOrder} />}

                    <button
                      type="submit"
                      disabled={placing}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-mahalyred py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {placing ? "Placing Order…" : "Place Cash on Delivery Order"}
                    </button>
                  </form>
                )}

                {paymentMethod === "card" && CARD_PAYMENT_ENABLED && (
                  <div className="space-y-4">
                    {appliedCoupon && appliedCoupon.discountEgp > 0 && (
                      <p className="rounded-md bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800">
                        Discount codes aren&apos;t supported for card payments yet — code
                        &quot;{appliedCoupon.code}&quot; won&apos;t be deducted from this card
                        charge. Switch to Cash on Delivery to use it.
                      </p>
                    )}
                    {(cardState.phase === "idle" ||
                      cardState.phase === "cancelled" ||
                      cardState.phase === "error") && (
                      <>
                        {cardState.phase === "cancelled" && (
                          <p className="rounded-md bg-stone-50 px-3.5 py-2.5 text-[13px] text-ink-soft/70">
                            Card payment was cancelled. You can try again or switch to Cash on
                            Delivery.
                          </p>
                        )}
                        {cardState.error && <InlineError error={cardState.error} />}
                        <button
                          type="button"
                          onClick={startCardAttempt}
                          className="flex w-full items-center justify-center gap-2 rounded-md bg-mahalyred py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01]"
                        >
                          Pay with Card
                        </button>
                      </>
                    )}

                    {cardState.phase === "requesting" && (
                      <button
                        type="button"
                        disabled
                        className="flex w-full items-center justify-center gap-2 rounded-md bg-mahalyred py-3.5 text-[14px] font-semibold text-cream opacity-60"
                      >
                        Starting secure checkout…
                      </button>
                    )}

                    {/* Rendered continuously (never removed from the tree) for the
                        whole card-attempt lifecycle once Pixel has mounted into it —
                        only visually toggled via CSS. Pixel injects its own DOM nodes
                        into #paymob-pixel-container that React has no knowledge of;
                        if this block were conditionally unmounted by phase (as it used
                        to be), React's reconciliation would try to remove DOM nodes it
                        no longer recognizes and crash with a removeChild error the
                        instant the phase changed away from pixel_open — which used to
                        happen almost immediately (see the polling effect below). */}
                    {pixelMountEverStarted && (
                      <div
                        className={`rounded-md border border-stone-150 bg-white p-4 ${
                          cardState.phase === "ready" || cardState.phase === "pixel_open" ? "" : "hidden"
                        }`}
                      >
                        <p className="mb-3 text-[12.5px] leading-relaxed text-ink-soft/65">
                          Enter your card details below. Please don&apos;t close this window
                          until you&apos;re done — we&apos;ll confirm your payment once it&apos;s
                          verified.
                        </p>
                        <div id={PAYMOB_PIXEL_CONTAINER_ID} />
                      </div>
                    )}

                    {cardState.phase === "confirming" && (
                      <p className="rounded-md bg-stone-50 px-3.5 py-2.5 text-[13px] text-ink-soft/70">
                        Payment submitted. Confirming payment…
                      </p>
                    )}

                    {cardState.phase === "confirmed" && (
                      <div className="flex flex-col items-start py-2">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-mahalyred text-cream">
                          <PartyPopper className="h-5 w-5" strokeWidth={1.8} />
                        </div>
                        <h2 className="mt-4 text-lg font-bold tracking-tightest text-ink">
                          Payment confirmed
                        </h2>
                        <p className="mt-2 text-[13.5px] text-ink-soft/70">
                          {cardState.isPartial
                            ? "Your payment went through and part of your order is confirmed — one item couldn't be fulfilled and our team will follow up by email about a refund for that portion."
                            : "Thank you — your order is confirmed. A confirmation email is on its way."}
                        </p>
                        <Link
                          href="/"
                          className="mt-5 inline-flex items-center gap-2 rounded-full bg-mahalyred px-6 py-3 text-sm font-semibold text-cream transition-transform hover:scale-[1.03]"
                        >
                          Continue Shopping
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === "confirmation" && (
              <div className="flex max-w-lg flex-col items-start py-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-mahalyred text-cream">
                  <PartyPopper className="h-6 w-6" strokeWidth={1.8} />
                </div>
                <h1 className="mt-6 text-2xl font-bold tracking-tightest text-ink">
                  Order confirmed
                </h1>
                {orderNumbers.length > 1 ? (
                  <p className="mt-2 text-[14px] text-ink-soft/70">
                    Thank you — your order shipped as{" "}
                    <span className="font-semibold text-ink">{orderNumbers.length} separate shipments</span>{" "}
                    (
                    {orderNumbers.map((n, i) => (
                      <span key={n}>
                        <span className="font-semibold text-ink">#{n}</span>
                        {i < orderNumbers.length - 1 ? ", " : ""}
                      </span>
                    ))}
                    ), one per brand/warehouse. Confirmation emails are on their way.
                  </p>
                ) : (
                  <p className="mt-2 text-[14px] text-ink-soft/70">
                    Thank you — your order{" "}
                    <span className="font-semibold text-ink">#{orderNumbers[0]}</span> has
                    been placed. A confirmation email is on its way.
                  </p>
                )}
                <Link
                  href="/"
                  className="mt-7 inline-flex items-center gap-2 rounded-full bg-mahalyred px-6 py-3 text-sm font-semibold text-cream transition-transform hover:scale-[1.03]"
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
              <div className="mt-5 space-y-5">
                {shipmentGroups.map((group) => (
                  <div key={group.key}>
                    <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-soft/50">
                      {group.isPool
                        ? group.brandNames.length > 1
                          ? `${group.brandNames.join(", ")} · Zakhnook shipment`
                          : `${group.brandNames[0] ?? "Zakhnook"} · Zakhnook shipment`
                        : `${group.brandNames[0] ?? "Brand"} · separate shipment`}
                    </p>
                    <div className="mt-2 space-y-3 divide-y divide-stone-150">
                      {group.items.map((item) => (
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
                <FieldError id="coupon-error" error={couponError || undefined} />
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
                  </>
                )}
                <div className="flex items-center justify-between">
                  <span>
                    Delivery{" "}
                    {shipmentGroups.length > 1 && (
                      <span className="text-[11.5px] text-ink-soft/50">
                        ({shipmentGroups.length} shipments)
                      </span>
                    )}
                  </span>
                  <span className="font-medium text-ink">
                    {totalShippingEgp > 0 ? `${totalShippingEgp.toLocaleString("en-US")} EGP` : "Free"}
                  </span>
                </div>
                {subtotal.egp > 0 && (
                  <div className="flex items-center justify-between text-ink">
                    <span className="font-semibold">Total (EGP)</span>
                    <span className="font-semibold">
                      {(
                        subtotal.egp -
                        (appliedCoupon?.discountEgp ?? 0) +
                        totalShippingEgp
                      ).toLocaleString("en-US")}{" "}
                      EGP
                    </span>
                  </div>
                )}
              </div>
              {shipmentGroups.length > 1 && (
                <p className="mt-4 text-center text-[12px] text-ink-soft/50">
                  This order will be split into {shipmentGroups.length} shipments — one per brand/warehouse — each with its own delivery fee and tracking.
                </p>
              )}
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
