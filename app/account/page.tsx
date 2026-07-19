"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User, Mail, Lock, LogOut, Package } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase/client";
import { formatPrice, formatSize } from "@/lib/format";
import type { OrderRecord } from "@/types";

interface OrderRow {
  id: string;
  order_number: string;
  status: OrderRecord["status"];
  shipping_name: string;
  shipping_email: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_governorate: string;
  subtotal_usd: number;
  subtotal_egp: number;
  discount_amount_egp: number;
  created_at: string;
  order_items: {
    id: string;
    product_id: string | null;
    name: string;
    brand: string;
    price: number;
    currency: "USD" | "EGP";
    size: string;
    color: string | null;
    quantity: number;
    image: string;
  }[];
}

function toOrderRecord(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    shippingName: row.shipping_name,
    shippingEmail: row.shipping_email,
    shippingPhone: row.shipping_phone,
    shippingAddress: row.shipping_address,
    shippingCity: row.shipping_city,
    shippingGovernorate: row.shipping_governorate,
    subtotalUsd: Number(row.subtotal_usd),
    subtotalEgp: Number(row.subtotal_egp),
    discountAmountEgp: Number(row.discount_amount_egp),
    createdAt: row.created_at,
    items: row.order_items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.name,
      brand: item.brand,
      price: Number(item.price),
      currency: item.currency,
      size: item.size,
      color: item.color ?? undefined,
      quantity: item.quantity,
      image: item.image,
    })),
  };
}

export default function AccountPage() {
  const { user, loading, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState("");

  const [orders, setOrders] = useState<OrderRecord[] | null>(null);
  const [ordersError, setOrdersError] = useState("");

  useEffect(() => {
    if (!user) {
      setOrders(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("orders")
      .select("*, order_items(*)")
      // Explicit even though RLS also enforces it — RLS additionally allows
      // a brand owner to read orders containing their brand's items (for
      // fulfillment), which this "my purchase history" view must never
      // surface under the customer's own name.
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setOrdersError(error.message);
          return;
        }
        setOrders((data as OrderRow[]).map(toOrderRecord));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setConfirmationMessage("");

    const result =
      mode === "sign-in"
        ? await signIn(email, password)
        : await signUp(fullName, email, password);

    if (result.error) {
      setError(result.error);
    } else if (result.needsEmailConfirmation) {
      setConfirmationMessage(
        "Check your inbox to confirm your account before signing in."
      );
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-cream">
        <Header />
        <div className="mx-auto max-w-screen2xl px-8 py-24 text-center text-sm text-ink-soft/60 lg:px-12">
          Loading…
        </div>
        <Footer />
      </main>
    );
  }

  if (user) {
    return (
      <main className="min-h-screen bg-cream">
        <Header />

        <section className="mx-auto max-w-screen2xl px-8 py-16 lg:px-12 lg:py-24">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tightest text-ink">
                {(user.user_metadata?.full_name as string) || "Your account"}
              </h1>
              <p className="mt-1 text-sm text-ink-soft/60">{user.email}</p>
            </div>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-2 rounded-md border border-stone-150 px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-stone-100"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.8} />
              Sign out
            </button>
          </div>

          <div className="mt-12">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
              <Package className="h-5 w-5" strokeWidth={1.6} />
              My Orders
            </h2>

            {ordersError && (
              <p className="mt-4 text-sm text-red-700">{ordersError}</p>
            )}

            {orders === null && !ordersError && (
              <p className="mt-4 text-sm text-ink-soft/60">Loading orders…</p>
            )}

            {orders?.length === 0 && (
              <p className="mt-4 text-sm text-ink-soft/60">
                No orders yet.{" "}
                <Link href="/shop/women" className="font-semibold text-ink hover:underline">
                  Start shopping
                </Link>
              </p>
            )}

            <div className="mt-6 space-y-6">
              {orders?.map((order) => (
                <div
                  key={order.id}
                  className="rounded-xl3 border border-stone-150 bg-white p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[14px] font-semibold text-ink">
                        #{order.orderNumber}
                      </p>
                      <p className="text-[12.5px] text-ink-soft/50">
                        {new Date(order.createdAt).toLocaleDateString("en-US")} ·{" "}
                        <span className="capitalize">{order.status}</span>
                      </p>
                    </div>
                    <p className="text-[14px] font-semibold text-ink">
                      {order.subtotalUsd > 0 &&
                        formatPrice(order.subtotalUsd, "USD")}
                      {order.subtotalUsd > 0 && order.subtotalEgp > 0 && " + "}
                      {order.subtotalEgp > 0 &&
                        formatPrice(order.subtotalEgp, "EGP")}
                    </p>
                  </div>

                  <div className="mt-4 space-y-2 divide-y divide-stone-150">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between pt-2 first:pt-0"
                      >
                        <p className="text-[13px] text-ink-soft/80">
                          {item.name} · Qty {item.quantity} · {formatSize(item.size)}
                        </p>
                        <p className="text-[13px] font-medium text-ink">
                          {formatPrice(item.price * item.quantity, item.currency)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-cream">
      <Header />

      <section className="mx-auto flex max-w-screen2xl flex-col items-center px-8 py-16 lg:px-12 lg:py-24">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-100">
          <User className="h-6 w-6 text-ink-soft/60" strokeWidth={1.6} />
        </div>

        <h1 className="mt-6 text-3xl font-bold tracking-tightest text-ink">
          {mode === "sign-in" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm text-ink-soft/60">
          {mode === "sign-in"
            ? "Sign in to view your orders and wishlist."
            : "Join Local to save your favorites and track orders."}
        </p>

        <form onSubmit={handleSubmit} className="mt-9 w-full max-w-sm space-y-4">
          {mode === "create" && (
            <div className="relative">
              <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
              <input
                type="text"
                placeholder="Full name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border border-stone-150 bg-white py-3 pl-11 pr-4 text-[14px] text-ink outline-none focus:border-ink/30"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
            <input
              type="email"
              placeholder="Email address"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-stone-150 bg-white py-3 pl-11 pr-4 text-[14px] text-ink outline-none focus:border-ink/30"
            />
          </div>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40" />
            <input
              type="password"
              placeholder="Password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-stone-150 bg-white py-3 pl-11 pr-4 text-[14px] text-ink outline-none focus:border-ink/30"
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
              {error}
            </p>
          )}
          {confirmationMessage && (
            <p className="rounded-md bg-stone-100 px-3.5 py-2.5 text-[13px] font-medium text-ink">
              {confirmationMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-ink py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? "Please wait…"
              : mode === "sign-in"
              ? "Sign In"
              : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-[13px] text-ink-soft/60">
          {mode === "sign-in" ? (
            <>
              New to Local?{" "}
              <button
                onClick={() => {
                  setMode("create");
                  setError("");
                  setConfirmationMessage("");
                }}
                className="font-semibold text-ink hover:underline"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => {
                  setMode("sign-in");
                  setError("");
                  setConfirmationMessage("");
                }}
                className="font-semibold text-ink hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>

        <Link
          href="/"
          className="mt-10 text-[12.5px] text-ink-soft/40 hover:text-ink-soft/70"
        >
          ← Back to Local
        </Link>
      </section>

      <Footer />
    </main>
  );
}
