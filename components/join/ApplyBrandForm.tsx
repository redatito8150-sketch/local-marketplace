"use client";

import { useState } from "react";
import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { submitBrandApplication, type BrandApplicationInput } from "@/lib/join/submitApplication";

const EMPTY_FORM: BrandApplicationInput = {
  brandName: "",
  founderName: "",
  email: "",
  phone: "",
  instagramOrWebsite: "",
  productCategory: "",
  brandStory: "",
  salesChannels: "",
};

const PRODUCT_CATEGORIES = [
  "Women's Fashion",
  "Men's Fashion",
  "Kids",
  "Accessories",
  "Home & Living",
  "Beauty",
  "Other",
];

export default function ApplyBrandForm() {
  const [form, setForm] = useState<BrandApplicationInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof BrandApplicationInput>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await submitBrandApplication(form);
      setSubmitted(true);
    } catch {
      setError("Something went wrong sending your application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex max-w-lg flex-col items-start py-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-cream">
          <PartyPopper className="h-6 w-6" strokeWidth={1.8} />
        </div>
        <h1 className="mt-6 font-serif text-2xl font-semibold text-ink">
          Application received
        </h1>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-soft/70">
          Thank you for applying to sell on Local. Our team reviews every
          application and will reach out to{" "}
          <span className="font-medium text-ink">{form.email}</span> within a
          few business days.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-cream transition-transform hover:scale-[1.03]"
        >
          Back to Local
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Brand name"
          value={form.brandName}
          onChange={(v) => set("brandName", v)}
          required
        />
        <Field
          label="Founder name"
          value={form.founderName}
          onChange={(v) => set("founderName", v)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Email"
          type="email"
          value={form.email}
          onChange={(v) => set("email", v)}
          required
        />
        <Field
          label="Phone"
          type="tel"
          value={form.phone}
          onChange={(v) => set("phone", v)}
          required
        />
      </div>

      <Field
        label="Instagram or website"
        placeholder="@yourbrand or yourbrand.com"
        value={form.instagramOrWebsite}
        onChange={(v) => set("instagramOrWebsite", v)}
        required
      />

      <label className="block">
        <span className="text-[12.5px] font-medium text-ink-soft/70">Product category</span>
        <select
          value={form.productCategory}
          onChange={(e) => set("productCategory", e.target.value)}
          required
          className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
        >
          <option value="" disabled>
            Select a category
          </option>
          {PRODUCT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>

      <TextAreaField
        label="Short brand story"
        value={form.brandStory}
        onChange={(v) => set("brandStory", v)}
        rows={4}
        required
      />

      <TextAreaField
        label="Current sales channels"
        placeholder="e.g. Instagram DMs, a pop-up market, your own website…"
        value={form.salesChannels}
        onChange={(v) => set("salesChannels", v)}
        rows={2}
        required
      />

      {error && (
        <p className="rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-ink py-3.5 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Submit application"}
      </button>
    </form>
  );
}

function Field({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  required,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
      />
    </label>
  );
}

function TextAreaField({
  label,
  placeholder,
  value,
  onChange,
  rows = 3,
  required,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        required={required}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
      />
    </label>
  );
}
