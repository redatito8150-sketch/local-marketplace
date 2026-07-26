import { Alert, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Href, useRouter } from "expo-router";
import { Image } from "expo-image";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppText } from "@/components/ui/AppText";
import { Badge, Card } from "@/components/ui/Primitives";
import { deleteReview, reportReview, Review, toggleReviewHelpful } from "@/domain/brands";
import { useAuth } from "@/providers/AuthProvider";
import { useAppTheme } from "@/theme/ThemeProvider";

export function ReviewCard({ review }: { review: Review }) {
  const { colors, spacing } = useAppTheme(); const router = useRouter(); const auth = useAuth(); const client = useQueryClient();
  const refresh = () => { void client.invalidateQueries({ queryKey: ["brand"] }); void client.invalidateQueries({ queryKey: ["reviews"] }); };
  const helpful = useMutation({ mutationFn: () => toggleReviewHelpful(review.id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => deleteReview(review.id), onSuccess: refresh });
  const report = useMutation({ mutationFn: () => reportReview(review.id) });
  return <Card style={{ gap: spacing.xs }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}><AppText variant="label">{review.authorName}</AppText><View style={{ flexDirection: "row" }}>{Array.from({ length: 5 }, (_, index) => <Ionicons key={index} name={index < review.rating ? "star" : "star-outline"} size={14} color={colors.accent} />)}</View></View>
    <Badge tone="success">Verified purchase</Badge>{review.title ? <AppText variant="label">{review.title}</AppText> : null}<AppText>{review.body}</AppText><AppText variant="caption" style={{ color: colors.textMuted }}>{review.productName}</AppText>
    {review.images.length ? <View style={{ flexDirection: "row", gap: spacing.xs }}>{review.images.map((image) => <Image key={image.id} source={image.url} alt="Customer review photo" style={{ width: 72, height: 72 }} />)}</View> : null}
    <View style={{ flexDirection: "row", gap: spacing.md }}>{review.isOwn ? <><Pressable onPress={() => router.push(`/reviews/${review.id}/edit` as Href)}><AppText variant="caption" style={{ color: colors.primary }}>Edit</AppText></Pressable><Pressable onPress={() => Alert.alert("Delete review?", "This cannot be undone.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => remove.mutate() }])}><AppText variant="caption" style={{ color: colors.danger }}>Delete</AppText></Pressable></> : <><Pressable onPress={() => auth.isAuthenticated ? helpful.mutate() : router.push("/sign-in")}><AppText variant="caption" style={{ color: review.viewerFoundHelpful ? colors.primary : colors.textMuted }}>Helpful {review.helpfulCount}</AppText></Pressable><Pressable onPress={() => auth.isAuthenticated ? report.mutate() : router.push("/sign-in")}><AppText variant="caption" style={{ color: colors.textMuted }}>{report.isSuccess ? "Reported" : "Report"}</AppText></Pressable></>}</View>
    {review.reply ? <View style={{ backgroundColor: colors.background, padding: spacing.sm }}><AppText variant="label">{review.reply.brandName}</AppText><AppText>{review.reply.body}</AppText></View> : null}
  </Card>;
}
