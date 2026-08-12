"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CartLineItem, PurchasedCartLine } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { applyPurchasedItemRemoval, cartStorageKey } from "@/lib/cart/cartStorage";

export type { CartLineItem, PurchasedCartLine };

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
  // Removes exactly the given quantities (decrementing, not just deleting
  // the whole line) of matching productId+size+color entries — anything
  // else in the cart, including items added after the purchase this list
  // came from, is left completely untouched. The safe alternative to
  // clearCart() for reconciling a specific confirmed purchase; see its
  // callers in app/checkout/page.tsx and
  // lib/payments/reconcilePendingCardPayment.ts for why a blind clearCart()
  // is unsafe there.
  removePurchasedItems: (purchased: PurchasedCartLine[]) => void;
  itemCount: number;
  subtotal: { usd: number; egp: number };
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<CartLineItem[]>([]);
  // Which storage scope `items` currently reflects — null until the first
  // hydration completes. Both effects below gate on this so that (a)
  // nothing is ever persisted before a scope has been loaded (which would
  // stomp real stored data with an empty array) and (b) switching identity
  // never persists the outgoing scope's in-memory items into the new
  // scope's key — each identity's storage is only ever written from data
  // that was itself hydrated from that same identity's key.
  const [hydratedForKey, setHydratedForKey] = useState<string | null>(null);
  // Deliberately null (not a "guest" default) while auth is still
  // resolving — hydrating into the guest scope first and then swapping to
  // the real account's scope a moment later would work, but risks a
  // visible flash of the wrong cart on every signed-in page load.
  const storageKey = authLoading ? null : cartStorageKey(user?.id ?? null);

  useEffect(() => {
    if (!storageKey || storageKey === hydratedForKey) return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      // One-time hydration from an external system per scope — not
      // derivable during render itself.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems(stored ? JSON.parse(stored) : []);
    } catch {
      setItems([]);
    }
    setHydratedForKey(storageKey);
  }, [storageKey, hydratedForKey]);

  useEffect(() => {
    if (!storageKey || storageKey !== hydratedForKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey, hydratedForKey]);

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

  const removePurchasedItems = useCallback((purchased: PurchasedCartLine[]) => {
    setItems((prev) => applyPurchasedItemRemoval(prev, purchased));
  }, []);

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
        removePurchasedItems,
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
