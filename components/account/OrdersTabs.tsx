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
      <div className="flex flex-wrap gap-2 border-b border-stone-150 pb-4">
        {ORDER_STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-ink text-cream"
                : "bg-stone-100 text-ink-soft/70 hover:bg-stone-150"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredOrders.length === 0 ? (
        <p className="mt-6 text-[13px] text-ink-soft/60">
          No orders here yet.{" "}
          <Link href="/shop/women" className="font-semibold text-ink hover:underline">
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
