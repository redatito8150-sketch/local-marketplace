import Link from "next/link";
import { getAllOrdersForAdmin } from "@/lib/data/admin";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABELS, orderStatusBadgeClass } from "@/lib/admin/statuses";

export default async function AdminOrdersPage() {
  const orders = await getAllOrdersForAdmin();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">
        Orders ({orders.length})
      </h1>

      <div className="mt-8 overflow-x-auto rounded-xl3 border border-stone-150 bg-white">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-stone-150 text-[12px] uppercase tracking-wide text-ink-soft/50">
            <tr>
              <th className="px-5 py-3 font-medium">Order</th>
              <th className="px-5 py-3 font-medium">Customer</th>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Total</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-150">
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="px-5 py-3 font-medium text-ink">#{order.orderNumber}</td>
                <td className="px-5 py-3 text-ink-soft/70">
                  <p>{order.shippingName}</p>
                  <p className="text-[12px] text-ink-soft/50">{order.shippingEmail}</p>
                </td>
                <td className="px-5 py-3 text-ink-soft/70">
                  {new Date(order.createdAt).toLocaleDateString()}
                </td>
                <td className="px-5 py-3 font-medium text-ink">
                  {order.subtotalUsd > 0 && formatPrice(order.subtotalUsd, "USD")}
                  {order.subtotalUsd > 0 && order.subtotalEgp > 0 && " + "}
                  {order.subtotalEgp > 0 && formatPrice(order.subtotalEgp, "EGP")}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${orderStatusBadgeClass(
                      order.status
                    )}`}
                  >
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="text-[12.5px] font-medium text-ink hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {orders.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-soft/60">No orders yet.</p>
        )}
      </div>
    </div>
  );
}
