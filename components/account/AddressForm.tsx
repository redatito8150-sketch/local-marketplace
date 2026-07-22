"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AddressLabel, AddressRecord } from "@/types";
import { accountInputClass, accountPrimaryButton } from "@/components/account/AccountUI";

interface FormState {
  label: AddressLabel;
  firstName: string;
  lastName: string;
  phone: string;
  addressLine: string;
  city: string;
  governorate: string;
  buildingNumber: string;
  floor: string;
  apartment: string;
  landmark: string;
  deliveryInstructions: string;
  postalCode: string;
}

function toFormState(address?: AddressRecord): FormState {
  return {
    label: address?.label ?? "Home",
    firstName: address?.firstName ?? "",
    lastName: address?.lastName ?? "",
    phone: address?.phone ?? "",
    addressLine: address?.addressLine ?? "",
    city: address?.city ?? "",
    governorate: address?.governorate ?? "",
    buildingNumber: address?.buildingNumber ?? "",
    floor: address?.floor ?? "",
    apartment: address?.apartment ?? "",
    landmark: address?.landmark ?? "",
    deliveryInstructions: address?.deliveryInstructions ?? "",
    postalCode: address?.postalCode ?? "",
  };
}

export default function AddressForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: AddressRecord;
}) {
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

    try {
      const url =
        mode === "create" ? "/api/account/addresses" : `/api/account/addresses/${initial!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.push("/account/addresses");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      <label className="block">
        <span className="text-[12.5px] font-medium text-[var(--account-text-muted)]">Label</span>
        <select
          value={form.label}
          onChange={(e) => set("label", e.target.value as AddressLabel)}
          className={accountInputClass}
        >
          <option value="Home">Home</option>
          <option value="Work">Work</option>
          <option value="Other">Other</option>
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="First name"
          value={form.firstName}
          onChange={(v) => set("firstName", v)}
          required
        />
        <TextField
          label="Last name"
          value={form.lastName}
          onChange={(v) => set("lastName", v)}
          required
        />
      </div>

      <TextField label="Phone" value={form.phone} onChange={(v) => set("phone", v)} required />
      <TextField
        label="Street"
        value={form.addressLine}
        onChange={(v) => set("addressLine", v)}
        placeholder="Street name"
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="City" value={form.city} onChange={(v) => set("city", v)} required />
        <TextField
          label="Governorate"
          value={form.governorate}
          onChange={(v) => set("governorate", v)}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Building number"
          value={form.buildingNumber}
          onChange={(v) => set("buildingNumber", v)}
        />
        <TextField label="Floor" value={form.floor} onChange={(v) => set("floor", v)} />
        <TextField
          label="Apartment"
          value={form.apartment}
          onChange={(v) => set("apartment", v)}
        />
      </div>

      <TextField
        label="Landmark (optional)"
        value={form.landmark}
        onChange={(v) => set("landmark", v)}
        placeholder="Near a well-known place"
      />
      <TextField
        label="Delivery instructions (optional)"
        value={form.deliveryInstructions}
        onChange={(v) => set("deliveryInstructions", v)}
      />
      <TextField
        label="Postal code (optional)"
        value={form.postalCode}
        onChange={(v) => set("postalCode", v)}
      />

      {error && (
        <p role="alert" className="rounded-xl bg-[color-mix(in_srgb,var(--account-danger)_12%,transparent)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--account-danger)]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className={accountPrimaryButton}
      >
        {submitting ? "Saving…" : mode === "create" ? "Save Address" : "Save Changes"}
      </button>
    </form>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-[var(--account-text-muted)]">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={accountInputClass}
      />
    </label>
  );
}
