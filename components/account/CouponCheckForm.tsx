"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/format";

interface CouponResult {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  discountEgp: number;
}

// Previews what a code would apply against a test subtotal — no balance
// ledger exists, this reuses the exact same /api/coupons/validate endpoint
// checkout itself calls, just without an active cart.
export default function CouponCheckForm() {
  const [code, setCode] = useState("");
  const [subtotal, setSubtotal] = useState("1000");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CouponResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setChecking(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotalEgp: Number(subtotal) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "This code isn't valid");
        return;
      }
      setResult(data);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <label className="block">
        <span className="text-[12.5px] font-medium text-ink-soft/70">Discount code</span>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. WELCOME10"
          className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] uppercase tracking-wide text-ink outline-none focus:border-ink/30"
        />
      </label>

      <label className="block">
        <span className="text-[12.5px] font-medium text-ink-soft/70">
          Test against a subtotal (EGP)
        </span>
        <input
          type="number"
          min={0}
          value={subtotal}
          onChange={(e) => setSubtotal(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
        />
      </label>

      {error && (
        <p className="rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-md bg-stone-100 px-3.5 py-3 text-[13px] text-ink">
          <p className="font-semibold">{result.code} is valid</p>
          <p className="mt-1 text-ink-soft/70">
            {result.discountType === "percentage"
              ? `${result.discountValue}% off`
              : `${formatPrice(result.discountValue, "EGP")} off`}{" "}
            — {formatPrice(result.discountEgp, "EGP")} off this subtotal
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={checking}
        className="rounded-md bg-ink px-6 py-3 text-[13.5px] font-semibold text-cream transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {checking ? "Checking…" : "Check Code"}
      </button>
    </form>
  );
}
