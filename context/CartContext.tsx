"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CartLineItem } from "@/types";

export type { CartLineItem };

interface CartContextValue {
  items: CartLineItem[];
  addItem: (item: Omit<CartLineItem, "id">) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  clearCart: () => void;
  itemCount: number;
  subtotal: { usd: number; egp: number };
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "local_cart_v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLineItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setItems(JSON.parse(stored));
    } catch {
      // ignore malformed storage
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const addItem = useCallback((item: Omit<CartLineItem, "id">) => {
    const lineId = `${item.productId}-${item.size}-${item.color ?? "default"}`;
    setItems((prev) => {
      const existing = prev.find((i) => i.id === lineId);
      if (existing) {
        return prev.map((i) =>
          i.id === lineId ? { ...i, quantity: i.quantity + item.quantity } : i
        );
      }
      return [...prev, { ...item, id: lineId }];
    });
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== lineId));
  }, []);

  const updateQuantity = useCallback((lineId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === lineId ? { ...i, quantity: Math.max(1, quantity) } : i
      )
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );

  const subtotal = useMemo(() => {
    return items.reduce(
      (totals, i) => {
        const lineTotal = i.price * i.quantity;
        if (i.currency === "EGP") totals.egp += lineTotal;
        else totals.usd += lineTotal;
        return totals;
      },
      { usd: 0, egp: 0 }
    );
  }, [items]);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        itemCount,
        subtotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
