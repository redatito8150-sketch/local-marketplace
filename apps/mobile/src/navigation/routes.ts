export const routes = {
  home: "/(tabs)",
  categories: "/(tabs)/categories",
  wishlist: "/(tabs)/wishlist",
  cart: "/(tabs)/cart",
  profile: "/(tabs)/profile",
  signIn: "/sign-in",
  signUp: "/sign-up",
  passwordRecovery: "/password-recovery",
  search: "/search"
} as const;

export type StaticRoute = (typeof routes)[keyof typeof routes];
export type EntityRoute =
  | `/products/${string}`
  | `/brands/${string}`
  | `/orders/${string}`;

export const productRoute = (id: string): EntityRoute => `/products/${encodeURIComponent(id)}`;
export const brandRoute = (slug: string): EntityRoute => `/brands/${encodeURIComponent(slug)}`;
export const orderRoute = (id: string): EntityRoute => `/orders/${encodeURIComponent(id)}`;
