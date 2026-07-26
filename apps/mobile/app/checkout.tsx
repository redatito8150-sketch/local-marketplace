import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import * as Crypto from "expo-crypto";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Card } from "@/components/ui/Primitives";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { getAddresses, Address } from "@/domain/addresses";
import { formatPrice } from "@/domain/products";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { useCart } from "@/providers/CartProvider";
import { useAppTheme } from "@/theme/ThemeProvider";

type Shipping = { firstName: string; lastName: string; email: string; phone: string; address: string; city: string; governorate: string };
const empty: Shipping = { firstName: "", lastName: "", email: "", phone: "", address: "", city: "", governorate: "" };
const fromAddress = (address: Address, email: string): Shipping => ({ firstName: address.firstName, lastName: address.lastName, email, phone: address.phone, address: address.addressLine, city: address.city, governorate: address.governorate });

export default function CheckoutRoute() {
  const router = useRouter(); const cart = useCart(); const auth = useAuth(); const { colors, spacing } = useAppTheme();
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: getAddresses, enabled: auth.isAuthenticated });
  const [selected, setSelected] = useState<string | null>(null);
  const [shipping, setShipping] = useState<Shipping>({ ...empty, email: auth.user?.email ?? "" });
  const [placing, setPlacing] = useState(false); const [error, setError] = useState("");
  const [idempotencyKey] = useState(() => Crypto.randomUUID());
  const egp = useMemo(() => cart.items.filter((item) => item.currency === "EGP").reduce((sum, item) => sum + item.price * item.quantity, 0), [cart.items]);
  const select = (address: Address) => { setSelected(address.id); setShipping(fromAddress(address, auth.user?.email ?? "")); };
  const field = (key: keyof Shipping, label: string) => <TextField label={label} value={shipping[key]} onChangeText={(value) => { setSelected(null); setShipping((current) => ({ ...current, [key]: value })); }} keyboardType={key === "email" ? "email-address" : key === "phone" ? "phone-pad" : "default"} />;
  const placeOrder = async () => {
    if (placing) return;
    if (!cart.items.length || Object.values(shipping).some((value) => !value.trim())) { setError("Complete all delivery fields before placing your order."); return; }
    setPlacing(true); setError("");
    try {
      const result = await apiRequest<{ orderNumber: string }>("/api/orders", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({
        items: cart.items.map((item) => ({ productId: item.productId, size: item.size, color: item.color, quantity: item.quantity })),
        shipping, addressId: selected ?? undefined
      }) });
      cart.clearCart();
      router.replace({ pathname: "/order-success", params: { orderNumber: result.orderNumber } } as never);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't place your order.");
    } finally { setPlacing(false); }
  };
  return <Screen scroll keyboardShouldPersistTaps="handled"><Stack.Screen options={{ headerShown: true, title: "Checkout" }} />
    <AppText variant="display" style={{ marginVertical: spacing.lg }}>Checkout</AppText>
    {addresses.data?.map((address) => <Pressable key={address.id} onPress={() => select(address)}><Card style={{ borderColor: selected === address.id ? colors.primary : colors.border, marginBottom: spacing.sm }}><AppText variant="label">{address.label}{address.isDefault ? " · Default" : ""}</AppText><AppText>{address.addressLine}, {address.city}</AppText></Card></Pressable>)}
    <AppText variant="title" style={{ marginVertical: spacing.md }}>{selected ? "Delivery details" : "New delivery address"}</AppText>
    <View style={{ gap: spacing.sm }}>{field("firstName", "First name")}{field("lastName", "Last name")}{field("email", "Email")}{field("phone", "Phone")}{field("address", "Street and building")}{field("city", "City")}{field("governorate", "Governorate")}</View>
    <Card style={{ marginVertical: spacing.lg, gap: spacing.xs }}><AppText variant="title">Cash on delivery</AppText><AppText style={{ color: colors.textMuted }}>Mahaly currently collects no card details. Final price, discounts and stock are validated by the server.</AppText>{egp ? <AppText variant="title">{formatPrice(egp, "EGP")} before server validation</AppText> : null}</Card>
    {error ? <AppText accessibilityRole="alert" style={{ color: colors.danger, marginBottom: spacing.sm }}>{error}</AppText> : null}
    <AppButton label="Place order" loading={placing} disabled={!cart.items.length} onPress={placeOrder} />
  </Screen>;
}
