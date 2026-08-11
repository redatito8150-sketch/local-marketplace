import { getPaymentAttemptsNeedingRefundReview } from "@/lib/data/admin";
import { formatPrice } from "@/lib/format";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import RefundQueueActions from "@/components/admin/RefundQueueActions";

// Admin visibility for card payments that were captured (money in) but
// couldn't be fully turned into an order — a total failure
// (fulfillment_failed) or a partial one (fulfilled, but at least one
// vendor shipment failed). No refund is ever issued automatically from
// here — see RefundQueueActions — this page only ever records that a
// human has handled it outside this system, once, per attempt.
export default async function RefundQueuePage() {
  const items = await getPaymentAttemptsNeedingRefundReview();
  const pending = items.filter((item) => !item.refundedAt);
  const resolved = items.filter((item) => item.refundedAt);

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Card payments"
        title={`Refund review (${pending.length})`}
        description="Card payments that were captured but couldn't be fully fulfilled — full failures need a full refund, partial ones need a refund for just the unfulfilled portion. Marking one here records that it was handled; it does not call Paymob or move any money."
      />

      <DashboardPanel className="mt-6" title="Needs review">
        {pending.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[10.5px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Attempt</th>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 font-semibold">Paid</th>
                  <th className="px-5 py-3 font-semibold">Refund owed</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pending.map((item) => (
                  <tr key={item.paymentAttemptId} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4 font-mono text-[11.5px] text-slate-600">
                      {item.paymentAttemptId}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${
                          item.isPartial ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {item.isPartial ? "Partial fulfillment" : "Full failure"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {item.paidAt ? new Date(item.paidAt).toLocaleString("en-US") : "—"}
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-900">
                      {formatPrice(item.refundAmountCents / 100, item.currency === "EGP" ? "EGP" : "USD")}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <RefundQueueActions paymentAttemptId={item.paymentAttemptId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <DashboardEmptyState
            title="Nothing needs review"
            description="Every captured card payment either fulfilled cleanly or has already been marked as refunded."
          />
        )}
      </DashboardPanel>

      {resolved.length > 0 && (
        <DashboardPanel className="mt-6" title="Already marked refunded">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[10.5px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Attempt</th>
                  <th className="px-5 py-3 font-semibold">Refunded</th>
                  <th className="px-5 py-3 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resolved.map((item) => (
                  <tr key={item.paymentAttemptId}>
                    <td className="px-5 py-4 font-mono text-[11.5px] text-slate-600">
                      {item.paymentAttemptId}
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {new Date(item.refundedAt!).toLocaleString("en-US")}
                    </td>
                    <td className="px-5 py-4 text-slate-500">{item.refundNote ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashboardPanel>
      )}
    </div>
  );
}
