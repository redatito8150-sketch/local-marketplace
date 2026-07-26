export type CartItem = {
  id: string; productId: string; name: string; brand: string; image: string;
  price: number; currency: "EGP" | "USD"; size: string; color?: string; quantity: number;
};

export function cartLineId(item: Pick<CartItem, "productId" | "size" | "color">) {
  return `${item.productId}-${item.size}-${item.color ?? "default"}`;
}

export function clampQuantity(quantity: number, max = 10) {
  return Math.max(1, Math.min(max, Math.trunc(quantity)));
}

export function addCartLine(items: CartItem[], item: Omit<CartItem, "id">): CartItem[] {
  const id = cartLineId(item);
  const existing = items.find((line) => line.id === id);
  return existing
    ? items.map((line) => line.id === id ? { ...line, quantity: clampQuantity(line.quantity + item.quantity) } : line)
    : [...items, { ...item, id, quantity: clampQuantity(item.quantity) }];
}
