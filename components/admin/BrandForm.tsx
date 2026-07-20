"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type {
  BrandCategoryTab,
  BrandInfoBadge,
  BrandRecord,
  BrandShopTheLookTile,
  BrandValue,
} from "@/types";

interface BrandFormProps {
  mode: "create" | "edit";
  initial?: BrandRecord;
  otherBrands: { slug: string; name: string }[];
  // Round 3: reused as-is by the brand portal's own page-content editor —
  // "brand-portal" hides the slug field (the brand's own URL, an admin-only
  // concern) and the similar-brands cross-link picker, and lets the caller
  // point the submit/redirect somewhere other than /admin/brands.
  scope?: "admin" | "brand-portal";
  apiPath?: string;
  redirectPath?: string;
}

interface FormState {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  foundedYear: string;
  city: string;
  heroImage: string;
  logoImage: string;
  websiteUrl: string;
  aboutDescription: string;
  aboutImage: string;
  storyImage: string;
  storyImage2: string;
  storyBody: string;
  infoBadges: BrandInfoBadge[];
  categoryTabs: BrandCategoryTab[];
  activeTab: string;
  values: BrandValue[];
  similarBrandSlugs: string[];
  shopTheLook: BrandShopTheLookTile[];
}

function toFormState(brand?: BrandRecord): FormState {
  return {
    slug: brand?.slug ?? "",
    name: brand?.name ?? "",
    tagline: brand?.tagline ?? "",
    category: brand?.category ?? "",
    foundedYear: brand?.foundedYear ? String(brand.foundedYear) : "",
    city: brand?.city ?? "Cairo",
    heroImage: brand?.heroImage ?? "",
    logoImage: brand?.logoImage ?? "",
    websiteUrl: brand?.websiteUrl ?? "",
    aboutDescription: brand?.aboutDescription ?? "",
    aboutImage: brand?.aboutImage ?? "",
    storyImage: brand?.storyImage ?? "",
    storyImage2: brand?.storyImage2 ?? "",
    storyBody: brand?.storyBody ?? "",
    infoBadges: brand?.infoBadges?.length ? brand.infoBadges : [{ icon: "location", label: "" }],
    categoryTabs: brand?.categoryTabs?.length
      ? brand.categoryTabs
      : [{ id: "shop-all", label: "Shop All" }],
    activeTab: brand?.activeTab ?? "shop-all",
    values: brand?.values?.length ? brand.values : [{ icon: "flag", title: "", description: "" }],
    similarBrandSlugs: brand?.similarBrandSlugs ?? [],
    shopTheLook: brand?.shopTheLook?.length
      ? brand.shopTheLook
      : [{ image: "", title: "", href: "" }],
  };
}

export default function BrandForm({
  mode,
  initial,
  otherBrands,
  scope = "admin",
  apiPath,
  redirectPath,
}: BrandFormProps) {
  const router = useRouter();
  const isBrandPortal = scope === "brand-portal";
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const updateBadge = (index: number, patch: Partial<BrandInfoBadge>) =>
    setForm((f) => ({
      ...f,
      infoBadges: f.infoBadges.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }));
  const addBadge = () =>
    setForm((f) => ({ ...f, infoBadges: [...f.infoBadges, { icon: "location", label: "" }] }));
  const removeBadge = (index: number) =>
    setForm((f) => ({ ...f, infoBadges: f.infoBadges.filter((_, i) => i !== index) }));

  const updateTab = (index: number, patch: Partial<BrandCategoryTab>) =>
    setForm((f) => ({
      ...f,
      categoryTabs: f.categoryTabs.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    }));
  const addTab = () =>
    setForm((f) => ({ ...f, categoryTabs: [...f.categoryTabs, { id: "", label: "" }] }));
  const removeTab = (index: number) =>
    setForm((f) => ({ ...f, categoryTabs: f.categoryTabs.filter((_, i) => i !== index) }));

  const updateValue = (index: number, patch: Partial<BrandValue>) =>
    setForm((f) => ({
      ...f,
      values: f.values.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }));
  const addValue = () =>
    setForm((f) => ({
      ...f,
      values: [...f.values, { icon: "flag", title: "", description: "" }],
    }));
  const removeValue = (index: number) =>
    setForm((f) => ({ ...f, values: f.values.filter((_, i) => i !== index) }));

  const toggleSimilarBrand = (slug: string) =>
    setForm((f) => ({
      ...f,
      similarBrandSlugs: f.similarBrandSlugs.includes(slug)
        ? f.similarBrandSlugs.filter((s) => s !== slug)
        : [...f.similarBrandSlugs, slug],
    }));

  const updateShopTheLookTile = (index: number, patch: Partial<BrandShopTheLookTile>) =>
    setForm((f) => ({
      ...f,
      shopTheLook: f.shopTheLook.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    }));
  const addShopTheLookTile = () =>
    setForm((f) => ({
      ...f,
      shopTheLook: [...f.shopTheLook, { image: "", title: "", href: "" }],
    }));
  const removeShopTheLookTile = (index: number) =>
    setForm((f) => ({ ...f, shopTheLook: f.shopTheLook.filter((_, i) => i !== index) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const payload = {
      slug: form.slug.trim(),
      name: form.name.trim(),
      tagline: form.tagline.trim(),
      category: form.category.trim(),
      foundedYear: form.foundedYear ? Number(form.foundedYear) : undefined,
      city: form.city.trim(),
      heroImage: form.heroImage.trim(),
      logoImage: form.logoImage.trim(),
      websiteUrl: form.websiteUrl.trim(),
      aboutDescription: form.aboutDescription.trim(),
      aboutImage: form.aboutImage.trim(),
      storyImage: form.storyImage.trim(),
      storyImage2: form.storyImage2.trim(),
      storyBody: form.storyBody.trim(),
      infoBadges: form.infoBadges.filter((b) => b.label.trim()),
      categoryTabs: form.categoryTabs.filter((t) => t.id.trim() && t.label.trim()),
      activeTab: form.activeTab.trim(),
      values: form.values.filter((v) => v.title.trim() && v.description.trim()),
      similarBrandSlugs: form.similarBrandSlugs,
      shopTheLook: form.shopTheLook.filter((t) => t.image.trim() && t.title.trim()),
    };

    try {
      const url =
        apiPath ??
        (mode === "create" ? "/api/admin/brands" : `/api/admin/brands/${initial!.slug}`);
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.push(redirectPath ?? "/admin/brands");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {!isBrandPortal && (
        <TextField
          label="Slug (used in the URL — cannot be changed later)"
          value={form.slug}
          onChange={(v) => set("slug", v)}
          required
          disabled={mode === "edit"}
          hint="Lowercase letters, numbers, and hyphens only, e.g. marga-studio"
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <TextField label="Name" value={form.name} onChange={(v) => set("name", v)} required />
        <TextField
          label="Tagline"
          value={form.tagline}
          onChange={(v) => set("tagline", v)}
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <TextField
          label="Category"
          value={form.category}
          onChange={(v) => set("category", v)}
          required
        />
        <TextField
          label="Founded year (optional)"
          type="number"
          value={form.foundedYear}
          onChange={(v) => set("foundedYear", v)}
        />
        <TextField label="City" value={form.city} onChange={(v) => set("city", v)} required />
      </div>

      <TextField
        label="Hero image URL"
        value={form.heroImage}
        onChange={(v) => set("heroImage", v)}
        required
        hint="Must be on images.unsplash.com, or add the host to next.config.js remotePatterns first."
      />

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Logo image URL (optional)"
          value={form.logoImage}
          onChange={(v) => set("logoImage", v)}
          hint="Falls back to initials from the brand name if left blank."
        />
        <TextField
          label="Website URL (optional)"
          value={form.websiteUrl}
          onChange={(v) => set("websiteUrl", v)}
          hint="Shown as a 'Visit Website' button — hidden if left blank."
        />
      </div>

      <TextArea
        label="About description"
        value={form.aboutDescription}
        onChange={(v) => set("aboutDescription", v)}
        rows={3}
        required
      />
      <TextField
        label="About image URL"
        value={form.aboutImage}
        onChange={(v) => set("aboutImage", v)}
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Story image URL"
          value={form.storyImage}
          onChange={(v) => set("storyImage", v)}
          required
        />
        <TextField
          label="Story image URL 2 (optional)"
          value={form.storyImage2}
          onChange={(v) => set("storyImage2", v)}
          hint="Shows a second side-by-side image in Our Story — falls back to one image if left blank."
        />
      </div>
      <TextArea
        label="Story body"
        value={form.storyBody}
        onChange={(v) => set("storyBody", v)}
        rows={4}
        required
      />

      <div>
        <span className="text-[12.5px] font-medium text-ink-soft/70">Info badges</span>
        <div className="mt-1.5 space-y-2">
          {form.infoBadges.map((badge, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={badge.icon}
                onChange={(e) =>
                  updateBadge(i, { icon: e.target.value as BrandInfoBadge["icon"] })
                }
                className="rounded-md border border-stone-150 bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-ink/30"
              >
                <option value="location">Location</option>
                <option value="flag">Flag</option>
                <option value="truck">Truck</option>
                <option value="leaf">Leaf</option>
              </select>
              <input
                type="text"
                placeholder="Label"
                value={badge.label}
                onChange={(e) => updateBadge(i, { label: e.target.value })}
                className="w-full rounded-md border border-stone-150 bg-white px-3.5 py-2 text-[14px] text-ink outline-none focus:border-ink/30"
              />
              <button
                type="button"
                onClick={() => removeBadge(i)}
                className="rounded-md p-2 text-ink-soft/50 hover:bg-stone-100 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.6} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addBadge}
            className="flex items-center gap-1.5 text-[13px] font-medium text-ink hover:underline"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add badge
          </button>
        </div>
      </div>

      <div>
        <span className="text-[12.5px] font-medium text-ink-soft/70">Category tabs</span>
        <div className="mt-1.5 space-y-2">
          {form.categoryTabs.map((tab, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="id (e.g. shop-all)"
                value={tab.id}
                onChange={(e) => updateTab(i, { id: e.target.value })}
                className="w-full rounded-md border border-stone-150 bg-white px-3.5 py-2 text-[14px] text-ink outline-none focus:border-ink/30"
              />
              <input
                type="text"
                placeholder="Label"
                value={tab.label}
                onChange={(e) => updateTab(i, { label: e.target.value })}
                className="w-full rounded-md border border-stone-150 bg-white px-3.5 py-2 text-[14px] text-ink outline-none focus:border-ink/30"
              />
              <button
                type="button"
                onClick={() => removeTab(i)}
                className="rounded-md p-2 text-ink-soft/50 hover:bg-stone-100 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.6} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addTab}
            className="flex items-center gap-1.5 text-[13px] font-medium text-ink hover:underline"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add tab
          </button>
        </div>
      </div>

      <TextField
        label="Active tab id"
        value={form.activeTab}
        onChange={(v) => set("activeTab", v)}
        required
      />

      <div>
        <span className="text-[12.5px] font-medium text-ink-soft/70">Brand values</span>
        <div className="mt-1.5 space-y-3">
          {form.values.map((value, i) => (
            <div key={i} className="space-y-2 rounded-md border border-stone-150 p-3">
              <div className="flex items-center gap-2">
                <select
                  value={value.icon}
                  onChange={(e) =>
                    updateValue(i, { icon: e.target.value as BrandValue["icon"] })
                  }
                  className="rounded-md border border-stone-150 bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-ink/30"
                >
                  <option value="flag">Flag</option>
                  <option value="package">Package</option>
                  <option value="leaf">Leaf</option>
                  <option value="pen">Pen</option>
                </select>
                <input
                  type="text"
                  placeholder="Title"
                  value={value.title}
                  onChange={(e) => updateValue(i, { title: e.target.value })}
                  className="w-full rounded-md border border-stone-150 bg-white px-3.5 py-2 text-[14px] text-ink outline-none focus:border-ink/30"
                />
                <button
                  type="button"
                  onClick={() => removeValue(i)}
                  className="rounded-md p-2 text-ink-soft/50 hover:bg-stone-100 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.6} />
                </button>
              </div>
              <textarea
                placeholder="Description"
                value={value.description}
                onChange={(e) => updateValue(i, { description: e.target.value })}
                rows={2}
                className="w-full rounded-md border border-stone-150 bg-white px-3.5 py-2 text-[14px] text-ink outline-none focus:border-ink/30"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addValue}
            className="flex items-center gap-1.5 text-[13px] font-medium text-ink hover:underline"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add value
          </button>
        </div>
      </div>

      <div>
        <span className="text-[12.5px] font-medium text-ink-soft/70">
          Shop the Look tiles (up to 4 shown on the brand page)
        </span>
        <div className="mt-1.5 space-y-3">
          {form.shopTheLook.map((tile, i) => (
            <div key={i} className="space-y-2 rounded-md border border-stone-150 p-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Image URL"
                  value={tile.image}
                  onChange={(e) => updateShopTheLookTile(i, { image: e.target.value })}
                  className="w-full rounded-md border border-stone-150 bg-white px-3.5 py-2 text-[14px] text-ink outline-none focus:border-ink/30"
                />
                <button
                  type="button"
                  onClick={() => removeShopTheLookTile(i)}
                  className="rounded-md p-2 text-ink-soft/50 hover:bg-stone-100 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.6} />
                </button>
              </div>
              <input
                type="text"
                placeholder="Title (e.g. Summer Edit)"
                value={tile.title}
                onChange={(e) => updateShopTheLookTile(i, { title: e.target.value })}
                className="w-full rounded-md border border-stone-150 bg-white px-3.5 py-2 text-[14px] text-ink outline-none focus:border-ink/30"
              />
              <input
                type="text"
                placeholder="Filter link (e.g. ?type=Dresses) — leave blank to link to Shop All"
                value={tile.href}
                onChange={(e) => updateShopTheLookTile(i, { href: e.target.value })}
                className="w-full rounded-md border border-stone-150 bg-white px-3.5 py-2 text-[14px] text-ink outline-none focus:border-ink/30"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addShopTheLookTile}
            className="flex items-center gap-1.5 text-[13px] font-medium text-ink hover:underline"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add tile
          </button>
        </div>
      </div>

      {!isBrandPortal && otherBrands.length > 0 && (
        <div>
          <span className="text-[12.5px] font-medium text-ink-soft/70">Similar brands</span>
          <div className="mt-1.5 flex flex-wrap gap-4">
            {otherBrands.map((b) => (
              <label key={b.slug} className="flex items-center gap-1.5 text-[13.5px] text-ink">
                <input
                  type="checkbox"
                  checked={form.similarBrandSlugs.includes(b.slug)}
                  onChange={() => toggleSimilarBrand(b.slug)}
                />
                {b.name}
              </label>
            ))}
          </div>
        </div>
      )}

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
        {submitting ? "Saving…" : mode === "create" ? "Create brand" : "Save changes"}
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
  disabled,
  hint,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
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
        disabled={disabled}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 disabled:bg-stone-100 disabled:text-ink-soft/50"
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
