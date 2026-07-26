export type ReviewStatus = "published" | "pending" | "under_review" | "hidden" | "removed";
export type ReviewSort = "recent" | "helpful" | "highest" | "lowest" | "photos";

export interface PublicReview {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  brandSlug: string;
  authorName: string;
  authorAvatar?: string;
  rating: number;
  title?: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  verifiedPurchase: true;
  images: { id: string; url: string; order: number }[];
  helpfulCount: number;
  viewerFoundHelpful: boolean;
  reply?: { id: string; body: string; brandName: string; createdAt: string; updatedAt: string };
}

export interface ReviewSummary {
  average: number;
  total: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  verifiedPercent: number;
  withPhotos: number;
}

export interface ReviewFilters {
  rating?: number;
  photos: boolean;
  verified: boolean;
  replied: boolean;
  product?: string;
  query?: string;
  sort: ReviewSort;
  page: number;
}

export const EMPTY_SUMMARY: ReviewSummary = {
  average: 0,
  total: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  verifiedPercent: 0,
  withPhotos: 0,
};
