import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useAppTheme } from "@/theme/ThemeProvider";
import { useCart } from "@/providers/CartProvider";

const icons = {
  index: ["home-outline", "home"],
  categories: ["grid-outline", "grid"],
  wishlist: ["heart-outline", "heart"],
  cart: ["bag-outline", "bag"],
  profile: ["person-outline", "person"]
} as const;

export default function TabsLayout() {
  const { colors } = useAppTheme();
  const { itemCount } = useCart();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surfaceRaised,
          borderTopColor: colors.border
        },
        tabBarIcon: ({ color, focused, size }) => {
          const names = icons[route.name as keyof typeof icons] ?? icons.index;
          return <Ionicons name={names[focused ? 1 : 0]} color={color} size={size} />;
        }
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="categories" options={{ title: "Categories" }} />
      <Tabs.Screen name="wishlist" options={{ title: "Wishlist" }} />
      <Tabs.Screen name="cart" options={{ title: "Cart", tabBarBadge: itemCount || undefined }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
