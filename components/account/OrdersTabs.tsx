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
        <div className="mt-6 space-y-4">
          {filteredOrders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
