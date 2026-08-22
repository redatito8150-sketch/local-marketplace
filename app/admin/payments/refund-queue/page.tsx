import { getPaymentAttemptsNeedingRefundReview } from "@/lib/data/admin";
import { formatDateTime, formatPrice } from "@/lib/format";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import RefundQueueActions from "@/components/admin/RefundQueueActions";

// Admin visibility for card payments that were captured (money in) but
// couldn't be fully turned into an order — a total failure
// (fulfillment_failed) or a partial one (fulfilled, but at least one
// vendor shipment failed). Staff can request the exact amount here, but
// only an authenticated Paymob callback can confirm that money moved.
export default async function RefundQueuePage() {
  const items = await getPaymentAttemptsNeedingRefundReview();
  const pending = items.filter((item) => !item.refundedAt);
  const resolved = items.filter((item) => item.refundedAt);

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Card payments"
        title={`Refund review (${pending.length})`}
        description="Card payments that were captured but couldn't be fully fulfilled. A request stays pending until Paymob confirms the exact refund through its signed callback."
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
                      {item.paidAt ? formatDateTime(item.paidAt) : "—"}
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-900">
                      {formatPrice(item.refundAmountCents / 100, item.currency === "EGP" ? "EGP" : "USD")}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {item.pendingRefundAmountCents > 0 ? (
                        <span className="text-[11px] font-semibold text-amber-700">Awaiting Paymob confirmation</span>
                      ) : (
                        <RefundQueueActions paymentAttemptId={item.paymentAttemptId} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <DashboardEmptyState
            title="Nothing needs review"
            description="Every captured card payment either fulfilled cleanly or has a provider-confirmed refund."
          />
        )}
      </DashboardPanel>

      {resolved.length > 0 && (
        <DashboardPanel className="mt-6" title="Provider-confirmed refunds">
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
                      {formatDateTime(item.refundedAt!)}
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
