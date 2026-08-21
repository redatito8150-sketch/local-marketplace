import Link from "next/link";
import { notFound } from "next/navigation";
import { getPaymentAttemptForAdmin } from "@/lib/data/admin";
import { formatDateTime, formatPrice } from "@/lib/format";
import { PAYMENT_ATTEMPT_STATUS_LABELS, paymentAttemptStatusBadgeClass, ORDER_STATUS_LABELS, orderStatusBadgeClass } from "@/lib/admin/statuses";
import RefundQueueActions from "@/components/admin/RefundQueueActions";
import AllocateProviderRefundButton from "@/components/admin/AllocateProviderRefundButton";
import type { OrderStatus } from "@/types";

// The request RPC remains authoritative. This keeps the page from offering
// a duplicate request while one is waiting for verified provider evidence.
function isRefundEligible(status: string, refundedAt: string | null, pendingCount: number): boolean {
  return !refundedAt && pendingCount === 0 && (status === "fulfilled" || status === "fulfillment_failed");
}

export default async function AdminPaymentDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const attempt = await getPaymentAttemptForAdmin(params.id);
  if (!attempt) notFound();

  const currency = attempt.currency === "EGP" ? "EGP" : "USD";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-ink">Payment {attempt.specialReference}</h1>
          <p className="mt-1 text-[13px] text-ink-soft/60">{formatDateTime(attempt.createdAt)}</p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${paymentAttemptStatusBadgeClass(attempt.status)}`}>
          {PAYMENT_ATTEMPT_STATUS_LABELS[attempt.status as keyof typeof PAYMENT_ATTEMPT_STATUS_LABELS] ?? attempt.status}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl3 border border-stone-150 bg-white p-6">
          <h2 className="text-[15px] font-semibold text-ink">Fulfillment breakdown</h2>
          <p className="mt-1 text-[12px] text-ink-soft/50">
            One row per fulfillment bucket — a Zakhnook-partner pool, or one independent brand.
          </p>
          <div className="mt-4 divide-y divide-stone-150">
            {attempt.buckets.map((bucket) => (
              <div key={bucket.bucketKey} className="flex items-center justify-between gap-4 py-3 first:pt-0">
                <div>
                  <p className="text-[13.5px] font-medium text-ink">{bucket.brandName ?? "Zakhnook pool"}</p>
                  <p className="text-[12px] text-ink-soft/50">
                    {formatPrice(bucket.expectedAmountCents / 100, currency)}
                    {bucket.failureReason ? ` · ${bucket.failureReason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${
                      bucket.status === "fulfilled" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {bucket.status === "fulfilled" ? "Fulfilled" : "Failed"}
                  </span>
                  {bucket.orderId && (
                    <Link href={`/admin/orders/${bucket.orderId}`} className="text-[12px] font-bold text-mahalyred hover:underline">
                      View order
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {attempt.buckets.length === 0 && (
              <p className="py-3 text-[12.5px] text-ink-soft/50">
                No fulfillment attempt has run yet — this payment attempt hasn&apos;t reached a paid/fulfilled state.
              </p>
            )}
          </div>

          {attempt.siblingOrders.length > 0 && (
            <div className="mt-4 border-t border-stone-150 pt-4">
              <p className="text-[11.5px] font-medium text-ink-soft/60">
                Orders from purchase {attempt.masterOrderNumber}
              </p>
              <div className="mt-2 space-y-1.5">
                {attempt.siblingOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/admin/orders/${order.id}`}
                    className="flex items-center justify-between rounded-md bg-stone-50 px-2.5 py-1.5 text-[12px] hover:bg-stone-100"
                  >
                    <span className="font-medium text-ink">#{order.orderNumber}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${orderStatusBadgeClass(order.status)}`}>
                      {ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="h-fit rounded-xl3 border border-stone-150 bg-white p-6">
          <h2 className="text-[15px] font-semibold text-ink">Payment</h2>
          <div className="mt-3 space-y-1.5 text-[13px] text-ink-soft/75">
            <p>
              <span className="font-medium text-ink">{formatPrice(attempt.amountCents / 100, currency)}</span>
            </p>
            <p>{attempt.userEmail ?? "Unknown customer"}</p>
            <p>Provider: {attempt.provider}</p>
            {attempt.providerTransactionId && (
              <p className="text-[11.5px] text-ink-soft/50" title={attempt.providerTransactionId}>
                Transaction: {attempt.providerTransactionId}
              </p>
            )}
            {attempt.providerIntentionId && (
              <p className="text-[11.5px] text-ink-soft/50" title={attempt.providerIntentionId}>
                Intention: {attempt.providerIntentionId}
              </p>
            )}
            {attempt.failureReason && (
              <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-[12px] text-red-700">{attempt.failureReason}</p>
            )}
            <p className="text-[11.5px] text-ink-soft/50">{attempt.itemCount} item{attempt.itemCount === 1 ? "" : "s"}</p>
          </div>

          <div className="mt-4 border-t border-stone-150 pt-4 text-[13px] text-ink-soft/75">
            <p>Created: {formatDateTime(attempt.createdAt)}</p>
            {attempt.paidAt && <p>Paid: {formatDateTime(attempt.paidAt)}</p>}
            {attempt.processedAt && <p>Processed: {formatDateTime(attempt.processedAt)}</p>}
          </div>

          {attempt.providerRefunds.length > 0 && (
            <div className="mt-4 border-t border-stone-150 pt-4">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-soft/50">Provider refund ledger</p>
              <div className="mt-2 space-y-2">
                {attempt.providerRefunds.map((refund) => (
                  <div key={refund.id} className="rounded-lg bg-stone-50 px-3 py-2 text-[11px] text-ink-soft/70">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{formatPrice(refund.amountCents / 100, currency)}</span>
                      <span className={refund.allocatedOrderId && !refund.reversedAt ? "text-emerald-700" : "text-amber-700"}>
                        {refund.allocatedOrderId && !refund.reversedAt ? "Allocated" : "Needs allocation"}
                      </span>
                    </div>
                    <p className="mt-1">Confirmed {formatDateTime(refund.confirmedAt)}</p>
                    <p className="font-mono text-[10px]">Paymob: {refund.providerReference}</p>
                    {refund.allocatedOrderId && (
                      <Link href={`/admin/orders/${refund.allocatedOrderId}`} className="mt-1 inline-block font-semibold text-mahalyred hover:underline">
                        Open matched order
                      </Link>
                    )}
                    {!refund.allocatedOrderId && !refund.reversedAt && (
                      <div className="mt-1 border-t border-stone-150 pt-1">
                        {attempt.pendingRefundRequests
                          .filter((pending) => pending.amountCents === refund.amountCents)
                          .map((pending) => (
                            <AllocateProviderRefundButton
                              key={pending.id}
                              paymentAttemptId={attempt.id}
                              refundId={refund.id}
                              requestId={pending.id}
                              label={
                                pending.orderNumber
                                  ? `Allocate to order #${pending.orderNumber}`
                                  : "Allocate to failed fulfillment"
                              }
                            />
                          ))}
                        {!attempt.pendingRefundRequests.some((pending) => pending.amountCents === refund.amountCents) && (
                          <p className="text-[10px] text-amber-700">No exact-value pending request.</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {attempt.refundedAt ? (
            <div className="mt-4 rounded-md bg-stone-50 px-3 py-2.5 text-[12px] text-ink-soft/70">
              <p className="font-medium text-ink">Refunded {formatDateTime(attempt.refundedAt)}</p>
              {attempt.refundNote && <p className="mt-0.5">{attempt.refundNote}</p>}
            </div>
          ) : (
            isRefundEligible(attempt.status, attempt.refundedAt, attempt.pendingRefundRequests.length) && (
              <div className="mt-4 border-t border-stone-150 pt-4">
                <RefundQueueActions paymentAttemptId={attempt.id} />
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
