import { apiRequest } from "@/lib/api";
import { OrderStatus } from "./order-status";
export type { OrderStatus } from "./order-status";
export { orderProgress, statusLabel } from "./order-status";
export type OrderItem = { id: string; productId: string | null; name: string; brand: string; price: number; currency: "EGP" | "USD"; size: string; color?: string; quantity: number; image: string };
export type Order = { id: string; orderNumber: string; status: OrderStatus; shippingName: string; shippingEmail: string; shippingPhone: string; shippingAddress: string; shippingCity: string; shippingGovernorate: string; subtotalUsd: number; subtotalEgp: number; discountAmountEgp: number; createdAt: string; items: OrderItem[] };
export async function getOrders() { return (await apiRequest<{ orders: Order[] }>("/api/orders")).orders; }
export async function getOrder(id: string) { return (await apiRequest<{ order: Order }>(`/api/orders/${encodeURIComponent(id)}`)).order; }
