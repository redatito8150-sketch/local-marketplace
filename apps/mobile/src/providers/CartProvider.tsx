import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { addCartLine, CartItem, clampQuantity } from "@/domain/cart";

export type { CartItem };
type NewCartItem = Omit<CartItem, "id">;
type CartContextValue = {
  items: CartItem[]; itemCount: number; hydrated: boolean;
  addItem: (item: NewCartItem) => void; removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void; clearCart: () => void;
};
const CartContext = createContext<CartContextValue | null>(null);
const KEY = "mahaly_cart_v1";

export function CartProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((value) => {
      if (value) {
        try { setItems(JSON.parse(value) as CartItem[]); } catch { /* discard invalid local data */ }
      }
    }).finally(() => setHydrated(true));
  }, []);
  useEffect(() => { if (hydrated) void AsyncStorage.setItem(KEY, JSON.stringify(items)); }, [hydrated, items]);
  const addItem = useCallback((item: NewCartItem) => {
    setItems((current) => addCartLine(current, item));
  }, []);
  const removeItem = useCallback((id: string) => setItems((items) => items.filter((item) => item.id !== id)), []);
  const updateQuantity = useCallback((id: string, quantity: number) => setItems((items) => items.map((item) => item.id === id ? { ...item, quantity: clampQuantity(quantity) } : item)), []);
  const clearCart = useCallback(() => setItems([]), []);
  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  return <CartContext.Provider value={{ items, itemCount, hydrated, addItem, removeItem, updateQuantity, clearCart }}>{children}</CartContext.Provider>;
}
export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}
