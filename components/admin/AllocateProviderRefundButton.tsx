"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAppError } from "@/lib/errors/client";
import InlineError from "@/components/shared/InlineError";
import type { AppError } from "@/types";

export default function AllocateProviderRefundButton({
  paymentAttemptId,
  refundId,
  requestId,
  label,
}: {
  paymentAttemptId: string;
  refundId: string;
  requestId: string;
  label: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const allocate = async () => {
    setSaving(true);
    setError(null);
    const result = await fetchWithAppError(
      `/api/admin/payments/${paymentAttemptId}/refunds/${refundId}/allocate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      }
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div>
      <button
        type="button"
        disabled={saving}
        onClick={allocate}
        className="mt-1 text-left text-[10.5px] font-semibold text-mahalyred hover:underline disabled:opacity-50"
      >
        {saving ? "Allocating…" : label}
      </button>
      {error && <InlineError error={error} />}
    </div>
  );
}
