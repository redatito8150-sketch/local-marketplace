import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OrderRefundEntry } from "@/types";

export interface OrderRefundSummary {
  capturedAmountCents: number;
  refundedAmountCents: number;
  pendingAmountCents: number;
  paymentStatus: "unpaid" | "paid" | "partially_refunded" | "refunded";
  lastConfirmedAt?: string;
}

export async function getOrderRefundSummaries(orderIds: string[]): Promise<Map<string, OrderRefundSummary>> {
  if (orderIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin.rpc("list_order_refund_summaries", {
    p_order_ids: orderIds,
  });
  if (error) throw new Error(`list_order_refund_summaries failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    order_id: string;
    captured_amount_cents: number;
    refunded_amount_cents: number;
    pending_amount_cents: number;
    payment_status: OrderRefundSummary["paymentStatus"];
    last_confirmed_at: string | null;
  }>;
  return new Map(
    rows.map((row) => [
      row.order_id,
      {
        capturedAmountCents: Number(row.captured_amount_cents),
        refundedAmountCents: Number(row.refunded_amount_cents),
        pendingAmountCents: Number(row.pending_amount_cents),
        paymentStatus: row.payment_status,
        lastConfirmedAt: row.last_confirmed_at ?? undefined,
      },
    ])
  );
}

export async function getOrderRefundLedgerForAdmin(orderId: string): Promise<OrderRefundEntry[]> {
  const [{ data: requestRows, error: requestError }, { data: allocationRows, error: allocationError }] =
    await Promise.all([
      supabaseAdmin
        .from("payment_refund_requests")
        .select("id, amount_cents, status, note, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("payment_refund_allocations")
        .select("id, request_id, refund_id, amount_cents, allocated_at, reversed_at")
        .eq("order_id", orderId)
        .order("allocated_at", { ascending: false }),
    ]);
  if (requestError) throw new Error(`payment_refund_requests read failed: ${requestError.message}`);
  if (allocationError) throw new Error(`payment_refund_allocations read failed: ${allocationError.message}`);

  const refundIds = [...new Set((allocationRows ?? []).map((row) => row.refund_id as string))];
  const { data: refundRows, error: refundError } = refundIds.length
    ? await supabaseAdmin
        .from("payment_refunds")
        .select("id, provider_reference, confirmed_at")
        .in("id", refundIds)
    : { data: [], error: null };
  if (refundError) throw new Error(`payment_refunds read failed: ${refundError.message}`);

  const refundsById = new Map((refundRows ?? []).map((row) => [row.id as string, row]));
  const allocationsByRequest = new Map((allocationRows ?? []).map((row) => [row.request_id as string, row]));

  return (requestRows ?? []).map((request): OrderRefundEntry => {
    const allocation = allocationsByRequest.get(request.id as string);
    const refund = allocation ? refundsById.get(allocation.refund_id as string) : null;
    const reversedAt = allocation?.reversed_at as string | null | undefined;
    return {
      id: (allocation?.id as string | undefined) ?? (request.id as string),
      requestId: request.id as string,
      amountCents: Number(request.amount_cents),
      status: reversedAt ? "reversed" : allocation ? "confirmed" : "pending",
      requestedAt: request.created_at as string,
      confirmedAt: refund?.confirmed_at as string | undefined,
      reversedAt: reversedAt ?? undefined,
      providerReference: refund?.provider_reference as string | undefined,
      note: (request.note as string | null) ?? undefined,
    };
  });
}
