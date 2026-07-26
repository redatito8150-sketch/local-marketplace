import { z } from "zod";
import type { ReviewFilters } from "./model.ts";

export const reviewInputSchema = z.object({
  productId: z.string().trim().min(1).max(100),
  orderItemId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().transform((v) => v || undefined),
  body: z.string().trim().min(10, "Your review must be at least 10 characters.").max(2000),
});

export const reviewEditSchema = reviewInputSchema.pick({ rating: true, title: true, body: true });
export const reportSchema = z.object({
  reason: z.enum(["spam", "offensive", "personal_information", "unrelated", "suspected_fake", "other"]),
  details: z.string().trim().max(500).optional(),
});
export const replySchema = z.object({ body: z.string().trim().min(2).max(1500) });
export const moderationSchema = z.object({
  status: z.enum(["published", "under_review", "hidden", "removed"]),
  reason: z.string().trim().max(500).optional(),
});

export function toReviewInsert(userId: string, input: z.infer<typeof reviewInputSchema>) {
  return {
    user_id: userId,
    product_id: input.productId,
    order_item_id: input.orderItemId,
    rating: input.rating,
    title: input.title,
    body: input.body,
  };
}

export function parseReviewFilters(params: Record<string, string | string[] | undefined>): ReviewFilters {
  const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const rating = Number(one(params.rating));
  const sortValue = one(params.sort);
  const sort = ["recent", "helpful", "highest", "lowest", "photos"].includes(sortValue ?? "")
    ? sortValue as ReviewFilters["sort"] : "recent";
  return {
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
    photos: one(params.photos) === "1",
    verified: one(params.verified) === "1",
    replied: one(params.replied) === "1",
    product: one(params.product)?.slice(0, 100),
    query: one(params.q)?.trim().slice(0, 100),
    sort,
    page: Math.max(1, Math.min(1000, Number(one(params.page)) || 1)),
  };
}
