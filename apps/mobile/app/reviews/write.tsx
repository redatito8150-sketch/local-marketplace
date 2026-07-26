import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { FilterChip } from "@/components/ui/Primitives";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { getReviews } from "@/domain/brands";
import { apiFormRequest } from "@/lib/api";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function WriteReviewRoute() {
  const params = useLocalSearchParams<{ productId?: string; brandSlug?: string }>(); const router = useRouter(); const client = useQueryClient(); const { colors, radius, spacing } = useAppTheme();
  const eligibility = useQuery({ queryKey: ["review-eligibility", params.productId, params.brandSlug], queryFn: () => getReviews(params) });
  const [selectedItem, setSelectedItem] = useState(""); const [rating, setRating] = useState(0); const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const items = eligibility.data?.eligibleItems ?? [];
  const chosen = items.find((item) => item.id === selectedItem) ?? (items.length === 1 ? items[0] : undefined);
  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError("Photo access is needed to attach review images."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 5, quality: 0.85 });
    if (!result.canceled) setImages(result.assets.slice(0, 5));
  };
  const submit = async () => {
    if (!chosen || rating < 1 || body.trim().length < 10) { setError("Choose an eligible purchase, rating, and write at least 10 characters."); return; }
    const form = new FormData(); form.append("productId", chosen.product_id); form.append("orderItemId", chosen.id); form.append("rating", String(rating)); form.append("title", title); form.append("body", body);
    images.forEach((asset, index) => form.append("images", { uri: asset.uri, name: asset.fileName ?? `review-${index}.jpg`, type: asset.mimeType ?? "image/jpeg" } as unknown as Blob));
    setBusy(true); setError("");
    try { await apiFormRequest("/api/reviews", form); await client.invalidateQueries({ queryKey: ["brand"] }); await client.invalidateQueries({ queryKey: ["product"] }); router.back(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Your review could not be published."); } finally { setBusy(false); }
  };
  return <AuthGuard><Screen scroll keyboardShouldPersistTaps="handled"><Stack.Screen options={{ headerShown: true, title: "Write review" }} /><AppText variant="display" style={{ marginVertical: spacing.lg }}>Share your experience</AppText>
    {!eligibility.isLoading && !items.length ? <AppText style={{ color: colors.textMuted }}>There are no fulfilled, unreviewed purchases eligible for a review.</AppText> : null}
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>{items.map((item) => <FilterChip key={item.id} label={item.name} selected={(chosen?.id ?? "") === item.id} onPress={() => setSelectedItem(item.id)} />)}</View>
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: spacing.sm, marginVertical: spacing.md }}>{Array.from({ length: 5 }, (_, index) => <Pressable accessibilityRole="radio" accessibilityLabel={`${index + 1} stars`} accessibilityState={{ checked: rating === index + 1 }} key={index} onPress={() => setRating(index + 1)}><Ionicons name={index < rating ? "star" : "star-outline"} size={32} color={colors.accent} /></Pressable>)}</View>
    <TextField label="Title (optional)" value={title} onChangeText={setTitle} maxLength={120} /><TextField label="Review" value={body} onChangeText={setBody} multiline maxLength={2000} style={{ minHeight: 120, textAlignVertical: "top" }} />
    <AppButton label={`Add photos (${images.length}/5)`} variant="secondary" onPress={pickImages} /><View style={{ flexDirection: "row", gap: spacing.xs }}>{images.map((asset) => <Image key={asset.assetId ?? asset.uri} source={asset.uri} alt="Review attachment" style={{ width: 64, height: 64, borderRadius: radius.sm }} />)}</View>
    {error ? <AppText accessibilityRole="alert" style={{ color: colors.danger }}>{error}</AppText> : null}<AppButton label="Publish verified review" loading={busy} disabled={!chosen} onPress={submit} />
  </Screen></AuthGuard>;
}
