import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, View } from "react-native";
import { useAppTheme } from "@/theme/ThemeProvider";
import { useCart } from "@/providers/CartProvider";

const icons = {
  index: ["home-outline", "home"],
  search: ["search-outline", "search"],
  categories: ["grid-outline", "grid"],
  wishlist: ["heart-outline", "heart"],
  cart: ["bag-outline", "bag"],
  profile: ["person-outline", "person"]
} as const;

export default function TabsLayout() {
  const { colors, isDark } = useAppTheme();
  const { itemCount } = useCart();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: Platform.OS === "ios" ? 18 : 14,
          height: 72,
          backgroundColor: isDark
            ? "rgba(36, 33, 31, 0.90)"
            : "rgba(255, 253, 252, 0.88)",
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255, 255, 255, 0.10)"
            : "rgba(140, 38, 56, 0.10)",
          borderRadius: 28,
          paddingTop: 8,
          paddingBottom: 8,
          elevation: 16,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.10,
          shadowRadius: 22
        },
        tabBarItemStyle: { borderRadius: 22 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 1 },
        tabBarIcon: ({ color, focused, size }) => {
          const names = icons[route.name as keyof typeof icons] ?? icons.index;
          return (
            <View
              style={{
                width: 42,
                height: 30,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: focused ? `${colors.primary}14` : "transparent"
              }}
            >
              <Ionicons name={names[focused ? 1 : 0]} color={color} size={size} />
            </View>
          );
        }
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="search" options={{ title: "Search" }} />
      <Tabs.Screen name="categories" options={{ href: null }} />
      <Tabs.Screen name="wishlist" options={{ title: "Wishlist" }} />
      <Tabs.Screen name="cart" options={{ title: "Cart", tabBarBadge: itemCount || undefined }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
