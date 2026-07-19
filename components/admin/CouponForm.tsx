"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CouponRecord } from "@/types";

interface CouponFormProps {
  mode: "create" | "edit";
  initial?: CouponRecord;
}

interface FormState {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  maxUses: string;
  expiresAt: string;
  active: boolean;
}

function toFormState(coupon?: CouponRecord): FormState {
  return {
    code: coupon?.code ?? "",
    discountType: coupon?.discountType ?? "percentage",
    discountValue: coupon ? String(coupon.discountValue) : "",
    maxUses: coupon?.maxUses ? String(coupon.maxUses) : "",
    expiresAt: coupon?.expiresAt ? coupon.expiresAt.slice(0, 10) : "",
    active: coupon?.active ?? true,
  };
}

export default function CouponForm({ mode, initial }: CouponFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const payload = {
      code: form.code.trim().toUpperCase(),
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      maxUses: form.maxUses ? Number(form.maxUses) : undefined,
      expiresAt: form.expiresAt || undefined,
      active: form.active,
    };

    try {
      const res = await fetch(
        mode === "create" ? "/api/admin/coupons" : `/api/admin/coupons/${initial!.code}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.push("/admin/coupons");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      <div>
        <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
          Code <span className="text-red-600">*</span>
        </label>
        <input
          type="text"
          value={form.code}
          onChange={(e) => set("code", e.target.value.toUpperCase())}
          disabled={mode === "edit"}
          placeholder="SUMMER20"
          className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] uppercase text-ink outline-none focus:border-ink/30 disabled:bg-stone-50 disabled:text-ink-soft/50"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
            Discount Type <span className="text-red-600">*</span>
          </label>
          <select
            value={form.discountType}
            onChange={(e) => set("discountType", e.target.value as "percentage" | "fixed")}
            className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
          >
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed amount (EGP)</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
            Value <span className="text-red-600">*</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.discountValue}
            onChange={(e) => set("discountValue", e.target.value)}
            placeholder={form.discountType === "percentage" ? "20" : "100"}
            className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
            Max Uses
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={form.maxUses}
            onChange={(e) => set("maxUses", e.target.value)}
            placeholder="Unlimited"
            className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft/70">
            Expires On
          </label>
          <input
            type="date"
            value={form.expiresAt}
            onChange={(e) => set("expiresAt", e.target.value)}
            className="w-full rounded-md border border-stone-150 bg-white px-3 py-2 text-[13.5px] text-ink outline-none focus:border-ink/30"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-[13px] font-medium text-ink">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => set("active", e.target.checked)}
        />
        Active
      </label>

      {error && <p className="text-[13px] text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-ink px-5 py-2.5 text-[13px] font-semibold text-cream transition-transform hover:scale-[1.02] disabled:opacity-60"
      >
        {submitting ? "Saving…" : mode === "create" ? "Create coupon" : "Save changes"}
      </button>
    </form>
  );
}
