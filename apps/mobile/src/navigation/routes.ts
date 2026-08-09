export const routes = {
  home: "/(tabs)",
  categories: "/(tabs)/categories",
  wishlist: "/(tabs)/wishlist",
  cart: "/(tabs)/cart",
  profile: "/(tabs)/profile",
  signIn: "/sign-in",
  signUp: "/sign-up",
  mfa: "/mfa",
  passwordRecovery: "/password-recovery",
  resetPassword: "/reset-password",
  search: "/search",
  products: "/products",
  addresses: "/addresses",
  checkout: "/checkout",
  orderSuccess: "/order-success"
} as const;

export type StaticRoute = (typeof routes)[keyof typeof routes];
export type EntityRoute =
  | `/products/${string}`
  | `/brands/${string}`
  | `/orders/${string}`
  | `/addresses/${string}`;

export const productRoute = (id: string): EntityRoute => `/products/${encodeURIComponent(id)}`;
export const brandRoute = (slug: string): EntityRoute => `/brands/${encodeURIComponent(slug)}`;
export const orderRoute = (id: string): EntityRoute => `/orders/${encodeURIComponent(id)}`;
