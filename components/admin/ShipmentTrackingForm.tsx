"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function toLocalInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function ShipmentTrackingForm({ orderId, carrierName, trackingNumber, expectedDeliveryAt, updatedAt }: {
  orderId: string;
  carrierName?: string;
  trackingNumber?: string;
  expectedDeliveryAt?: string;
  updatedAt?: string;
}) {
  const router = useRouter();
  const [carrier, setCarrier] = useState(carrierName ?? "");
  const [tracking, setTracking] = useState(trackingNumber ?? "");
  const [expected, setExpected] = useState(toLocalInputValue(expectedDeliveryAt));
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(updatedAt);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking: {
            carrierName: carrier.trim() || null,
            trackingNumber: tracking.trim() || null,
            expectedDeliveryAt: expected ? new Date(expected).toISOString() : null,
          },
          expectedUpdatedAt,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Shipping details could not be saved. Check the fields and try again.");
        return;
      }
      if (typeof data.updatedAt === "string") setExpectedUpdatedAt(data.updatedAt);
      setMessage("Shipping details saved.");
      router.refresh();
    } catch {
      setError("Shipping details could not be saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const control = "mt-1.5 h-10 w-full rounded-xl border border-[#e5ddd5] bg-white px-3 text-[11px] font-semibold text-[#51473f] outline-none transition-colors hover:border-[#d8ccc3] focus-visible:border-[#d8ccc3] focus-visible:ring-2 focus-visible:ring-[#C85956]/15";
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#8d8076]">Carrier
          <input name="carrierName" autoComplete="off" value={carrier} onChange={(event) => setCarrier(event.target.value)} maxLength={120} placeholder="Carrier name…" className={control} />
        </label>
        <label className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#8d8076]">Tracking number
          <input name="trackingNumber" autoComplete="off" value={tracking} onChange={(event) => setTracking(event.target.value)} maxLength={160} placeholder="Tracking reference…" className={control} />
        </label>
        <label className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#8d8076] sm:col-span-2">Expected delivery
          <input name="expectedDeliveryAt" type="datetime-local" value={expected} onChange={(event) => setExpected(event.target.value)} className={control} />
        </label>
      </div>
      {error && <p role="alert" className="mt-3 text-[10.5px] font-semibold leading-4 text-red-700">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-11 items-center rounded-xl bg-[#C85956] px-3 text-[10.5px] font-bold text-white transition-colors hover:bg-[#ad4744] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25 disabled:cursor-wait disabled:opacity-60">{saving ? "Saving…" : "Save shipping details"}</button>
        <span aria-live="polite" className="text-[10px] font-semibold text-emerald-700">{message}</span>
      </div>
    </div>
  );
}
