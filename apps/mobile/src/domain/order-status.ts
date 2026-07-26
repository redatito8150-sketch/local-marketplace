export type OrderStatus = "pending" | "paid" | "shipped" | "fulfilled" | "cancelled";

export const statusLabel: Record<OrderStatus, string> = {
  pending: "Processing",
  paid: "Paid",
  shipped: "Shipped",
  fulfilled: "Delivered",
  cancelled: "Cancelled",
};

export const orderProgress = (status: OrderStatus) => {
  if (status === "cancelled") return -1;
  return ({ pending: 0, paid: 1, shipped: 2, fulfilled: 3 } as const)[status];
};
