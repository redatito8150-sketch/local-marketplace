"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { ProductColorOption, ProductRecord } from "@/types";

interface ProductFormProps {
  mode: "create" | "edit";
  productId?: string;
  initial?: ProductRecord;
  brandOptions: { slug: string; name: string }[];
}

interface FormState {
  name: string;
  brandName: string;
  brandSlug: string;
  category: "" | "women" | "men" | "kids";
  price: string;
  currency: "USD" | "EGP";
  image: string;
  imagesText: string;
  sizesText: string;
  colors: ProductColorOption[];
  description: string;
  detailsText: string;
  careInstructionsText: string;
  shippingReturns: string;
  sku: string;
  inStock: boolean;
  isNew: boolean;
  isUnisex: boolean;
  unavailableSizes: string[];
}

function toFormState(product?: ProductRecord): FormState {
  return {
    name: product?.name ?? "",
    brandName: product?.brandName ?? "",
    brandSlug: product?.brandSlug ?? "",
    category: product?.category ?? "",
    price: product ? String(product.price) : "",
    currency: product?.currency ?? "USD",
    image: product?.image ?? "",
    imagesText: product?.images?.join("\n") ?? "",
    sizesText: product?.sizes?.join(", ") ?? "XS, S, M, L, XL",
    colors: product?.colors?.length ? product.colors : [{ name: "", hex: "#000000" }],
    description: product?.description ?? "",
    detailsText: product?.details?.join("\n") ?? "",
    careInstructionsText: product?.careInstructions?.join("\n") ?? "",
    shippingReturns: product?.shippingReturns ?? "",
    sku: product?.sku ?? "",
    inStock: product?.inStock ?? true,
    isNew: product?.isNew ?? false,
    isUnisex: product?.isUnisex ?? false,
    unavailableSizes: product?.unavailableSizes ?? [],
  };
}

export default function ProductForm({ mode, productId, initial, brandOptions }: ProductFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const updateColor = (index: number, patch: Partial<ProductColorOption>) => {
    setForm((f) => ({
      ...f,
      colors: f.colors.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  };

  const addColor = () =>
    setForm((f) => ({ ...f, colors: [...f.colors, { name: "", hex: "#000000" }] }));

  const removeColor = (index: number) =>
    setForm((f) => ({ ...f, colors: f.colors.filter((_, i) => i !== index) }));

  const currentSizes = form.sizesText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const toggleUnavailableSize = (size: string) =>
    setForm((f) => ({
      ...f,
      unavailableSizes: f.unavailableSizes.includes(size)
        ? f.unavailableSizes.filter((s) => s !== size)
        : [...f.unavailableSizes, size],
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      brandName: form.brandName.trim(),
      brandSlug: form.brandSlug || undefined,
      category: form.category || undefined,
      price: Number(form.price),
      currency: form.currency,
      image: form.image.trim(),
      images: form.imagesText.split("\n").map((s) => s.trim()).filter(Boolean),
      colors: form.colors.filter((c) => c.name.trim() && c.hex.trim()),
      sizes: form.sizesText.split(",").map((s) => s.trim()).filter(Boolean),
      description: form.description.trim(),
      details: form.detailsText.split("\n").map((s) => s.trim()).filter(Boolean),
      careInstructions: form.careInstructionsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      shippingReturns: form.shippingReturns.trim(),
      sku: form.sku.trim() || undefined,
      inStock: form.inStock,
      isNew: form.isNew,
      isUnisex: form.category !== "kids" && form.isUnisex,
      unavailableSizes: form.unavailableSizes.filter((s) => currentSizes.includes(s)),
    };

    try {
      const res = await fetch(
        mode === "create" ? "/api/admin/products" : `/api/admin/products/${productId}`,
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
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Name" value={form.name} onChange={(v) => set("name", v)} required />
        <TextField
          label="Brand name"
          value={form.brandName}
          onChange={(v) => set("brandName", v)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-[12.5px] font-medium text-ink-soft/70">Brand (optional)</span>
          <select
            value={form.brandSlug}
            onChange={(e) => set("brandSlug", e.target.value)}
            className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
          >
            <option value="">None</option>
            {brandOptions.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[12.5px] font-medium text-ink-soft/70">Category</span>
          <select
            value={form.category}
            onChange={(e) => set("category", e.target.value as FormState["category"])}
            className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
          >
            <option value="">None (brand-only product)</option>
            <option value="women">Women</option>
            <option value="men">Men</option>
            <option value="kids">Kids</option>
          </select>
        </label>
      </div>

      {(form.category === "women" || form.category === "men") && (
        <label className="flex items-center gap-2 text-[13.5px] text-ink">
          <input
            type="checkbox"
            checked={form.isUnisex}
            onChange={(e) => set("isUnisex", e.target.checked)}
          />
          Unisex (also show in Men & Women)
        </label>
      )}

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Price"
          type="number"
          value={form.price}
          onChange={(v) => set("price", v)}
          required
        />
        <label className="block">
          <span className="text-[12.5px] font-medium text-ink-soft/70">Currency</span>
          <select
            value={form.currency}
            onChange={(e) => set("currency", e.target.value as "USD" | "EGP")}
            className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
          >
            <option value="USD">USD</option>
            <option value="EGP">EGP</option>
          </select>
        </label>
      </div>

      <TextField
        label="Main image URL"
        value={form.image}
        onChange={(v) => set("image", v)}
        required
        hint="Must be on images.unsplash.com, or add the host to next.config.js remotePatterns first."
      />

      <TextArea
        label="Gallery image URLs (optional, one per line)"
        value={form.imagesText}
        onChange={(v) => set("imagesText", v)}
        rows={3}
      />

      <TextField
        label="Sizes (comma-separated)"
        value={form.sizesText}
        onChange={(v) => set("sizesText", v)}
        required
      />

      {currentSizes.length > 0 && (
        <div>
          <span className="text-[12.5px] font-medium text-ink-soft/70">
            Mark sizes unavailable
          </span>
          <div className="mt-1.5 flex flex-wrap gap-4">
            {currentSizes.map((size) => (
              <label key={size} className="flex items-center gap-1.5 text-[13.5px] text-ink">
                <input
                  type="checkbox"
                  checked={form.unavailableSizes.includes(size)}
                  onChange={() => toggleUnavailableSize(size)}
                />
                {size}
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className="text-[12.5px] font-medium text-ink-soft/70">Colors</span>
        <div className="mt-1.5 space-y-2">
          {form.colors.map((color, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Color name"
                value={color.name}
                onChange={(e) => updateColor(i, { name: e.target.value })}
                className="w-full rounded-md border border-stone-150 bg-white px-3.5 py-2 text-[14px] text-ink outline-none focus:border-ink/30"
              />
              <input
                type="color"
                value={color.hex}
                onChange={(e) => updateColor(i, { hex: e.target.value })}
                className="h-9 w-12 rounded-md border border-stone-150"
              />
              <button
                type="button"
                onClick={() => removeColor(i)}
                className="rounded-md p-2 text-ink-soft/50 hover:bg-stone-100 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.6} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addColor}
            className="flex items-center gap-1.5 text-[13px] font-medium text-ink hover:underline"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add color
          </button>
        </div>
      </div>

      <TextArea
        label="Description"
        value={form.description}
        onChange={(v) => set("description", v)}
        rows={3}
        required
      />

      <TextArea
        label="Details (one per line)"
        value={form.detailsText}
        onChange={(v) => set("detailsText", v)}
        rows={3}
      />

      <TextArea
        label="Care instructions (one per line)"
        value={form.careInstructionsText}
        onChange={(v) => set("careInstructionsText", v)}
        rows={3}
      />

      <TextArea
        label="Shipping & returns"
        value={form.shippingReturns}
        onChange={(v) => set("shippingReturns", v)}
        rows={2}
      />

      <TextField
        label="SKU (optional, auto-generated if left blank)"
        value={form.sku}
        onChange={(v) => set("sku", v)}
      />

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-[13.5px] text-ink">
          <input
            type="checkbox"
            checked={form.inStock}
            onChange={(e) => set("inStock", e.target.checked)}
          />
          In stock
        </label>
        <label className="flex items-center gap-2 text-[13.5px] text-ink">
          <input
            type="checkbox"
            checked={form.isNew}
            onChange={(e) => set("isNew", e.target.checked)}
          />
          Mark as new
        </label>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-ink px-6 py-3 text-[14px] font-semibold text-cream transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Saving…" : mode === "create" ? "Create product" : "Save changes"}
      </button>
    </form>
  );
}

function TextField({
  label,
  type = "text",
  value,
  onChange,
  required,
  hint,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
      />
      {hint && <span className="mt-1 block text-[11.5px] text-ink-soft/50">{hint}</span>}
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        required={required}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30"
      />
    </label>
  );
}
