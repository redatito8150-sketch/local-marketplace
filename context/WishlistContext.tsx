"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { WishlistItem } from "@/types";
import { useAuth } from "@/context/AuthContext";

export type { WishlistItem };

interface WishlistContextValue {
  items: WishlistItem[];
  toggleItem: (item: WishlistItem) => void;
  removeItem: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
  count: number;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);
const STORAGE_KEY = "local_wishlist_v1";

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Signed-in wishlists live in Supabase (own rows, via /api/wishlist);
  // signed-out browsing keeps the original localStorage behavior so
  // anonymous shoppers lose nothing. Switches over the moment auth state
  // resolves, not on every render.
  useEffect(() => {
    if (authLoading) return;

    if (user) {
      let cancelled = false;
      fetch("/api/wishlist")
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((data) => {
          if (!cancelled) setItems(data.items ?? []);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        })
        .finally(() => {
          if (!cancelled) setHydrated(true);
        });
      return () => {
        cancelled = true;
      };
    }

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
  }, [user, authLoading]);

  useEffect(() => {
    // Only the signed-out path persists to localStorage — signed-in state
    // lives server-side and is refetched, not mirrored back into storage.
    if (!hydrated || user) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated, user]);

  const toggleItem = useCallback(
    (item: WishlistItem) => {
      setItems((prev) => {
        const exists = prev.some((i) => i.productId === item.productId);
        return exists ? prev.filter((i) => i.productId !== item.productId) : [...prev, item];
      });

      if (user) {
        fetch("/api/wishlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: item.productId }),
        }).catch((err) => console.error("Failed to sync wishlist:", err));
      }
    },
    [user]
  );

  const removeItem = useCallback(
    (productId: string) => {
      setItems((prev) => prev.filter((i) => i.productId !== productId));

      if (user) {
        fetch(`/api/wishlist?productId=${encodeURIComponent(productId)}`, {
          method: "DELETE",
        }).catch((err) => console.error("Failed to sync wishlist:", err));
      }
    },
    [user]
  );

  const isWishlisted = useCallback(
    (productId: string) => items.some((i) => i.productId === productId),
    [items]
  );

  const count = useMemo(() => items.length, [items]);

  return (
    <WishlistContext.Provider
      value={{ items, toggleItem, removeItem, isWishlisted, count }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within a WishlistProvider");
  return ctx;
}
