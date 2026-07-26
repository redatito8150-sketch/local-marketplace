import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { getOwnReview, updateReview } from "@/domain/brands";
import { useAppTheme } from "@/theme/ThemeProvider";

export default function EditReviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>(); const query = useQuery({ queryKey: ["own-review", id], queryFn: () => getOwnReview(id), enabled: Boolean(id) });
  if (!query.data) return <Screen><AppText>{query.isError ? "Review not found." : "Loading review…"}</AppText></Screen>;
  return <ReviewForm key={query.data.id} review={query.data} />;
}
function ReviewForm({ review }: { review: Awaited<ReturnType<typeof getOwnReview>> }) {
  const router = useRouter(); const client = useQueryClient(); const { colors, spacing } = useAppTheme(); const [rating, setRating] = useState(review.rating); const [title, setTitle] = useState(review.title ?? ""); const [body, setBody] = useState(review.body); const [busy, setBusy] = useState(false);
  return <Screen><Stack.Screen options={{ headerShown: true, title: "Edit review" }} /><AppText variant="display" style={{ marginVertical: spacing.lg }}>Update your review</AppText><View style={{ flexDirection: "row", gap: spacing.sm }}>{Array.from({ length: 5 }, (_, index) => <Pressable accessibilityRole="radio" accessibilityLabel={`${index + 1} stars`} key={index} onPress={() => setRating(index + 1)}><Ionicons name={index < rating ? "star" : "star-outline"} size={32} color={colors.accent} /></Pressable>)}</View><TextField label="Title" value={title} onChangeText={setTitle} /><TextField label="Review" value={body} onChangeText={setBody} multiline /><AppButton label="Save review" loading={busy} onPress={async () => { setBusy(true); try { await updateReview(review.id, { rating, title, body }); await client.invalidateQueries({ queryKey: ["brand"] }); router.back(); } finally { setBusy(false); } }} /></Screen>;
}
