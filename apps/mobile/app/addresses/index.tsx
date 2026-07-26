import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Href, Stack, useRouter } from "expo-router";
import { Alert, FlatList, View } from "react-native";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ErrorState, LoadingState } from "@/components/system/States";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Badge, Card, EmptyState } from "@/components/ui/Primitives";
import { deleteAddress, getAddresses, setDefaultAddress } from "@/domain/addresses";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function AddressesRoute() {
  const router = useRouter();
  const { spacing } = useAppTheme();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["addresses"], queryFn: getAddresses });
  const refresh = () => client.invalidateQueries({ queryKey: ["addresses"] });
  const remove = useMutation({ mutationFn: deleteAddress, onSuccess: refresh });
  const makeDefault = useMutation({ mutationFn: setDefaultAddress, onSuccess: refresh });
  const confirmRemove = (id: string) => Alert.alert(
    "Delete this address?",
    "This action cannot be undone.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate(id) }
    ]
  );
  return <AuthGuard>
    <Stack.Screen options={{ headerShown: true, title: "Addresses" }} />
    {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState message="We couldn't load your addresses." onRetry={() => query.refetch()} /> :
      <FlatList data={query.data ?? []} keyExtractor={(item) => item.id} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState title="No saved addresses" message="Add an address for a faster checkout." />}
        renderItem={({ item }) => <Card><View style={{ gap: spacing.xs }}><View style={{ flexDirection: "row", justifyContent: "space-between" }}><AppText variant="title">{item.label}</AppText>{item.isDefault ? <Badge tone="success">Default</Badge> : null}</View><AppText>{item.firstName} {item.lastName}</AppText><AppText>{item.addressLine}, {item.city}, {item.governorate}</AppText><AppText>{item.phone}</AppText><View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}><AppButton label="Edit" variant="ghost" onPress={() => router.push(`/addresses/${item.id}` as Href)} />{!item.isDefault ? <AppButton label="Set default" variant="ghost" onPress={() => makeDefault.mutate(item.id)} /> : null}<AppButton label="Delete" variant="ghost" onPress={() => confirmRemove(item.id)} /></View></View></Card>}
        ListFooterComponent={<AppButton label="Add address" variant="secondary" onPress={() => router.push("/addresses/new" as Href)} />} />}
  </AuthGuard>;
}
