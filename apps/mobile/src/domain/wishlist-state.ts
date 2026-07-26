export type WishlistStateItem = {
  productId: string;
  name: string;
  brand: string;
  price: number;
  currency: "EGP" | "USD";
  image: string;
};

export function toggleWishlistState<T extends WishlistStateItem>(items: T[], nextItem: T) {
  return items.some((item) => item.productId === nextItem.productId)
    ? items.filter((item) => item.productId !== nextItem.productId)
    : [...items, nextItem];
}
