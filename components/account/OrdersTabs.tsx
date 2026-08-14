"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ORDER_STATUS_TABS, statusesForTab, type OrderStatusTab } from "@/lib/account/orderStatusLabels";
import OrderCard from "@/components/account/OrderCard";
import type { OrderRecord } from "@/types";

export default function OrdersTabs({ orders }: { orders: OrderRecord[] }) {
  const [activeTab, setActiveTab] = useState<OrderStatusTab>("all");

  const filteredOrders = useMemo(() => {
    const statuses = statusesForTab(activeTab);
    return orders.filter((o) => statuses.includes(o.status));
  }, [orders, activeTab]);

  // A single checkout can fan out into several shipments (see
  // brands.is_mahaly_partner splitting) — group by masterOrderId so a
  // multi-shipment purchase reads as one purchase event with N tracked
  // shipments, not N unrelated orders. Only wraps groups that actually have
  // more than one order surviving the current status filter.
  const groupedOrders = useMemo(() => {
    const byGroup = new Map<string, OrderRecord[]>();
    for (const order of filteredOrders) {
      const list = byGroup.get(order.masterOrderId) ?? [];
      list.push(order);
      byGroup.set(order.masterOrderId, list);
    }
    return [...byGroup.entries()].sort(
      (a, b) =>
        new Date(b[1][0].createdAt).getTime() - new Date(a[1][0].createdAt).getTime()
    );
  }, [filteredOrders]);

  return (
    <div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-[var(--account-border)] pb-4">
        {ORDER_STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--account-accent)]/30 ${
              activeTab === tab.id
                ? "bg-[var(--account-accent)] text-[var(--account-accent-foreground)]"
                : "bg-[var(--account-surface-muted)] text-[var(--account-text-muted)] hover:text-[var(--account-text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredOrders.length === 0 ? (
        <p className="mt-6 text-[13px] text-[var(--account-text-muted)]">
          No orders here yet.{" "}
          <Link href="/shop/women" className="font-semibold text-[var(--account-accent)] hover:underline">
            Start shopping
          </Link>
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {groupedOrders.map(([groupId, groupOrders]) =>
            groupOrders.length > 1 ? (
              <div key={groupId} className="rounded-[24px] border border-dashed border-[var(--account-border)] p-4">
                <p className="mb-3 px-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--account-text-muted)]">
                  Purchase {groupOrders[0].masterOrderNumber} · {groupOrders.length} shipments
                </p>
                <div className="space-y-4">
                  {groupOrders.map((order, index) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      showCancel={index === 0 && groupOrders.every((candidate) =>
                        candidate.paymentMethod === "cash_on_delivery" &&
                        candidate.paymentStatus === "unpaid" &&
                        (candidate.status === "pending" || candidate.status === "preparing")
                      )}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <OrderCard
                key={groupOrders[0].id}
                order={groupOrders[0]}
                showCancel={
                  groupOrders[0].paymentMethod === "cash_on_delivery" &&
                  groupOrders[0].paymentStatus === "unpaid" &&
                  (groupOrders[0].status === "pending" || groupOrders[0].status === "preparing")
                }
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
