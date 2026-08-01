import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateReviewSummary } from "./aggregates";
import { EMPTY_SUMMARY, type PublicReview, type ReviewFilters } from "./model";

const PAGE_SIZE = 10;
const missingTable = (message?: string) => Boolean(message?.includes("does not exist") || message?.includes("schema cache"));

export async function getEligibleOrderItems(userId: string, productId?: string, brandSlug?: string) {
  let query = supabaseAdmin.from("order_items").select("id,product_id,name,image,brand_slug,orders!inner(user_id,status,payment_status)")
    .eq("orders.user_id", userId).eq("orders.status", "fulfilled").neq("orders.payment_status", "refunded");
  if (productId) query = query.eq("product_id", productId);
  if (brandSlug) query = query.eq("brand_slug", brandSlug);
  const { data } = await query;
  if (!data?.length) return [];
  const { data: reviewed } = await supabaseAdmin.from("reviews").select("order_item_id").eq("user_id", userId).is("deleted_at", null);
  const used = new Set((reviewed ?? []).map((row) => row.order_item_id));
  return data.filter((row) => !used.has(row.id));
}

export async function getPublicReviews(args: { brandSlug?: string; productId?: string; filters: ReviewFilters }) {
  const { brandSlug, productId, filters } = args;
  let summaryQuery = supabaseAdmin.from("reviews").select("rating,review_images(id),products!inner(brand_slug)")
    .eq("status", "published").is("deleted_at", null);
  if (brandSlug) summaryQuery = summaryQuery.eq("products.brand_slug", brandSlug);
  if (productId) summaryQuery = summaryQuery.eq("product_id", productId);
  const { data: summaryRows, error: summaryError } = await summaryQuery;
  if (summaryError && missingTable(summaryError.message)) return { reviews: [], summary: EMPTY_SUMMARY, total: 0, page: 1, pages: 0, migrationPending: true };
  if (summaryError) throw summaryError;
  const summary = calculateReviewSummary((summaryRows ?? []).map((review: any) => ({ rating: review.rating, verifiedPurchase: true, imageCount: review.review_images?.length ?? 0 })));
  let query = supabaseAdmin.from("reviews").select(`
    id,user_id,product_id,rating,title,body,created_at,updated_at,
    products!inner(id,name,image,brand_slug,brands!products_brand_slug_fkey!inner(name)),
    review_images(id,storage_path,display_order),
    review_replies(id,body,created_at,updated_at,brand_slug),
    review_helpful_votes(user_id)
  `).eq("status", "published").is("deleted_at", null);
  if (brandSlug) query = query.eq("products.brand_slug", brandSlug);
  if (productId) query = query.eq("product_id", productId);
  if (filters.rating) query = query.eq("rating", filters.rating);
  if (filters.product) query = query.eq("product_id", filters.product);
  if (filters.query) query = query.or(`title.ilike.%${filters.query.replace(/[%_,]/g, "")}%,body.ilike.%${filters.query.replace(/[%_,]/g, "")}%`);
  if (filters.sort === "highest") query = query.order("rating", { ascending: false });
  else if (filters.sort === "lowest") query = query.order("rating", { ascending: true });
  else query = query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) {
    if (missingTable(error.message)) return { reviews: [], summary: EMPTY_SUMMARY, total: 0, page: 1, pages: 0, migrationPending: true };
    throw error;
  }
  const userIds = [...new Set((data ?? []).map((row) => row.user_id))];
  const { data: profiles } = userIds.length ? await supabaseAdmin.from("profiles").select("id,full_name").in("id", userIds) : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name || "Mahaly customer"]));
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  let reviews: PublicReview[] = (data ?? []).map((row: any) => ({
    id: row.id, productId: row.product_id, productName: row.products.name, productImage: row.products.image,
    brandSlug: row.products.brand_slug, authorName: names.get(row.user_id) ?? "Mahaly customer",
    rating: row.rating, title: row.title ?? undefined, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at,
    verifiedPurchase: true,
    images: (row.review_images ?? []).sort((a: any,b: any)=>a.display_order-b.display_order).map((image: any) => ({
      id: image.id, order: image.display_order,
      url: supabaseAdmin.storage.from("review-images").getPublicUrl(image.storage_path).data.publicUrl,
    })),
    helpfulCount: row.review_helpful_votes?.length ?? 0,
    viewerFoundHelpful: Boolean(user && row.review_helpful_votes?.some((vote: any) => vote.user_id === user.id)),
    reply: row.review_replies?.[0] ? { ...row.review_replies[0], brandName: row.products.brands.name, createdAt: row.review_replies[0].created_at, updatedAt: row.review_replies[0].updated_at } : undefined,
  }));
  if (filters.photos) reviews = reviews.filter((review) => review.images.length);
  if (filters.replied) reviews = reviews.filter((review) => review.reply);
  if (filters.sort === "helpful") reviews.sort((a,b)=>b.helpfulCount-a.helpfulCount);
  if (filters.sort === "photos") reviews.sort((a,b)=>b.images.length-a.images.length);
  const total = reviews.length, pages = Math.ceil(total / PAGE_SIZE), start = (filters.page - 1) * PAGE_SIZE;
  return { reviews: reviews.slice(start, start + PAGE_SIZE), summary, total, page: filters.page, pages, migrationPending: false };
}
