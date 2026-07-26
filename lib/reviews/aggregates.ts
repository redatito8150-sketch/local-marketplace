import { EMPTY_SUMMARY, type ReviewSummary } from "./model.ts";

export function calculateReviewSummary(
  reviews: { rating: number; verifiedPurchase?: boolean; imageCount?: number; status?: string; deleted?: boolean }[]
): ReviewSummary {
  const visible = reviews.filter((review) => (review.status ?? "published") === "published" && !review.deleted);
  if (!visible.length) return { ...EMPTY_SUMMARY, distribution: { ...EMPTY_SUMMARY.distribution } };
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as ReviewSummary["distribution"];
  let sum = 0, verified = 0, withPhotos = 0;
  for (const review of visible) {
    const rating = Math.round(review.rating) as 1 | 2 | 3 | 4 | 5;
    distribution[rating] += 1; sum += rating;
    if (review.verifiedPurchase !== false) verified += 1;
    if ((review.imageCount ?? 0) > 0) withPhotos += 1;
  }
  return { average: sum / visible.length, total: visible.length, distribution, verifiedPercent: Math.round(verified / visible.length * 100), withPhotos };
}

export function weightedBrandAverage(products: { rating: number; count: number }[]) {
  const total = products.reduce((sum, product) => sum + product.count, 0);
  return { average: total ? products.reduce((sum, product) => sum + product.rating * product.count, 0) / total : 0, total };
}

export function isEligibleOrder(status: string, paymentStatus: string) {
  return status === "fulfilled" && paymentStatus !== "refunded";
}
