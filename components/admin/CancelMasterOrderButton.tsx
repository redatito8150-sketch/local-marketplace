"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelMasterOrderButton({
  masterOrderId,
  masterOrderNumber,
  shipmentCount,
}: {
  masterOrderId: string;
  masterOrderNumber: string;
  shipmentCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleCancel = async () => {
    if (
      !confirm(
        `Cancel purchase ${masterOrderNumber}? This attempts to cancel all ${shipmentCount} shipments — any already shipped or fulfilled will be skipped, not force-cancelled.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/master-orders/${masterOrderId}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "Failed to cancel purchase");
        return;
      }
      const { cancelledOrderIds, skippedOrderIds } = data as {
        cancelledOrderIds: string[];
        skippedOrderIds: string[];
      };
      if (skippedOrderIds.length > 0) {
        alert(
          `Cancelled ${cancelledOrderIds.length} shipment(s). ${skippedOrderIds.length} shipment(s) were already shipped/fulfilled and were skipped.`
        );
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={busy}
      className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
    >
      Cancel whole purchase
    </button>
  );
}
