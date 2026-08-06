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
  // Changes a line's size/color in place — this recomputes its lineId (the
  // id encodes size+color), merging into an existing line of the new
  // size/color if one's already in the cart, same collapsing behavior as
  // addItem. Also used (with no size/color, just price/image/variantId) to
  // silently sync a line's stored snapshot to live data on the cart page —
  // stock/availability itself is validated by the caller (app/cart/page.tsx
  // via lib/cart/liveValidation.ts), never assumed here.
  updateVariant: (
    lineId: string,
    next: { size?: string; color?: string; variantId?: string; price?: number; image?: string }
  ) => void;
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
      // One-time hydration from an external system (localStorage isn't
      // available during SSR/render) — not derivable during render itself.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const updateVariant = useCallback(
    (
      lineId: string,
      next: { size?: string; color?: string; variantId?: string; price?: number; image?: string }
    ) => {
      setItems((prev) => {
        const current = prev.find((i) => i.id === lineId);
        if (!current) return prev;
        const size = next.size ?? current.size;
        const color = next.color !== undefined ? next.color : current.color;
        const patch: Partial<CartLineItem> = { size, color };
        if (next.variantId !== undefined) patch.variantId = next.variantId;
        if (next.price !== undefined) patch.price = next.price;
        if (next.image !== undefined) patch.image = next.image;

        const newLineId = `${current.productId}-${size}-${color ?? "default"}`;
        if (newLineId === lineId) {
          return prev.map((i) => (i.id === lineId ? { ...i, ...patch } : i));
        }
        const collision = prev.find((i) => i.id === newLineId);
        if (collision) {
          // Merge into the existing line of the target size/color, dropping
          // this one — same collapsing behavior as addItem hitting a
          // duplicate lineId.
          return prev
            .filter((i) => i.id !== lineId)
            .map((i) =>
              i.id === newLineId ? { ...i, quantity: i.quantity + current.quantity } : i
            );
        }
        return prev.map((i) =>
          i.id === lineId ? { ...i, ...patch, id: newLineId } : i
        );
      });
    },
    []
  );

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
        updateVariant,
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
