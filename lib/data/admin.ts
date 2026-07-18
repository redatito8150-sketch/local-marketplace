import { supabase } from "@/lib/supabase/client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ApplicationStatus,
  BrandApplicationRecord,
  BrandCategoryTab,
  BrandInfoBadge,
  BrandRecord,
  BrandValue,
  CategorySlug,
  OrderItemRecord,
  OrderRecord,
  OrderStatus,
  ProductColorOption,
  ProductRecord,
  ProfileRecord,
} from "@/types";

interface ProductRow {
  id: string;
  name: string;
  brand_name: string;
  brand_slug: string | null;
  category: CategorySlug | null;
  price: number;
  currency: "USD" | "EGP";
  image: string;
  images: string[];
  colors: ProductColorOption[];
  sizes: string[];
  description: string;
  details: string[];
  care_instructions: string[];
  shipping_returns: string;
  sku: string;
  in_stock: boolean;
  is_new: boolean;
  is_unisex: boolean;
  unavailable_sizes: string[];
}

function toProductRecord(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    name: row.name,
    brandName: row.brand_name,
    brandSlug: row.brand_slug ?? undefined,
    category: row.category ?? undefined,
    price: Number(row.price),
    currency: row.currency,
    image: row.image,
    images: row.images ?? [],
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    unavailableSizes: row.unavailable_sizes ?? [],
    description: row.description,
    details: row.details ?? [],
    careInstructions: row.care_instructions ?? [],
    shippingReturns: row.shipping_returns,
    sku: row.sku,
    inStock: row.in_stock,
    isNew: row.is_new,
    isUnisex: row.is_unisex,
  };
}

// Public SELECT policy on `products` already allows this — no service role
// needed for reads, only for the create/update/delete routes.
export async function getAllProductsForAdmin(): Promise<ProductRecord[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllProductsForAdmin failed: ${error.message}`);
  }
  return (data as ProductRow[]).map(toProductRecord);
}

export async function getProductForAdmin(id: string): Promise<ProductRecord | null> {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`getProductForAdmin(${id}) failed: ${error.message}`);
  }
  if (!data) return null;
  return toProductRecord(data as ProductRow);
}

interface BrandRow {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  founded_year: number | null;
  city: string;
  hero_image: string;
  about_description: string;
  about_image: string;
  story_image: string;
  story_body: string;
  info_badges: BrandInfoBadge[];
  category_tabs: BrandCategoryTab[];
  active_tab: string;
  values: BrandValue[];
  similar_brand_slugs: string[];
}

function toBrandRecord(row: BrandRow): BrandRecord {
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    category: row.category,
    foundedYear: row.founded_year ?? undefined,
    city: row.city,
    heroImage: row.hero_image,
    aboutDescription: row.about_description,
    aboutImage: row.about_image,
    storyImage: row.story_image,
    storyBody: row.story_body,
    infoBadges: row.info_badges ?? [],
    categoryTabs: row.category_tabs ?? [],
    activeTab: row.active_tab,
    values: row.values ?? [],
    similarBrandSlugs: row.similar_brand_slugs ?? [],
  };
}

// Public SELECT policy on `brands` already allows this — no service role
// needed for reads, only for the create/update/delete routes.
export async function getAllBrandsForAdmin(): Promise<BrandRecord[]> {
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllBrandsForAdmin failed: ${error.message}`);
  }
  return (data as BrandRow[]).map(toBrandRecord);
}

export async function getBrandForAdmin(slug: string): Promise<BrandRecord | null> {
  const { data, error } = await supabase.from("brands").select("*").eq("slug", slug).maybeSingle();

  if (error) {
    throw new Error(`getBrandForAdmin(${slug}) failed: ${error.message}`);
  }
  if (!data) return null;
  return toBrandRecord(data as BrandRow);
}

interface OrderItemRow {
  id: string;
  product_id: string | null;
  name: string;
  brand: string;
  price: number;
  currency: "USD" | "EGP";
  size: string;
  color: string | null;
  quantity: number;
  image: string;
}

interface OrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  user_id: string | null;
  shipping_name: string;
  shipping_email: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_governorate: string;
  subtotal_usd: number;
  subtotal_egp: number;
  created_at: string;
  order_items: OrderItemRow[];
}

function toOrderRecord(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    userId: row.user_id ?? undefined,
    shippingName: row.shipping_name,
    shippingEmail: row.shipping_email,
    shippingPhone: row.shipping_phone,
    shippingAddress: row.shipping_address,
    shippingCity: row.shipping_city,
    shippingGovernorate: row.shipping_governorate,
    subtotalUsd: Number(row.subtotal_usd),
    subtotalEgp: Number(row.subtotal_egp),
    createdAt: row.created_at,
    items: (row.order_items ?? []).map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.name,
      brand: item.brand,
      price: Number(item.price),
      currency: item.currency,
      size: item.size,
      color: item.color ?? undefined,
      quantity: item.quantity,
      image: item.image,
    })),
  };
}

// Orders have no public/admin RLS read policy, so admin reads go through
// the service-role client directly — these functions are only ever called
// from pages already behind the requireAdminUser()/layout gate.
export async function getAllOrdersForAdmin(): Promise<OrderRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*, order_items(*)")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllOrdersForAdmin failed: ${error.message}`);
  }
  return (data as OrderRow[]).map(toOrderRecord);
}

export async function getOrderForAdmin(id: string): Promise<OrderRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getOrderForAdmin(${id}) failed: ${error.message}`);
  }
  if (!data) return null;
  return toOrderRecord(data as OrderRow);
}

interface BrandApplicationRow {
  id: string;
  brand_name: string;
  founder_name: string;
  email: string;
  phone: string;
  instagram_or_website: string;
  product_category: string;
  brand_story: string;
  sales_channels: string;
  status: ApplicationStatus;
  created_at: string;
}

function toBrandApplicationRecord(row: BrandApplicationRow): BrandApplicationRecord {
  return {
    id: row.id,
    brandName: row.brand_name,
    founderName: row.founder_name,
    email: row.email,
    phone: row.phone,
    instagramOrWebsite: row.instagram_or_website,
    productCategory: row.product_category,
    brandStory: row.brand_story,
    salesChannels: row.sales_channels,
    status: row.status,
    createdAt: row.created_at,
  };
}

// brand_applications also has no public policy — service-role reads only.
export async function getAllApplicationsForAdmin(): Promise<BrandApplicationRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("brand_applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllApplicationsForAdmin failed: ${error.message}`);
  }
  return (data as BrandApplicationRow[]).map(toBrandApplicationRecord);
}

export async function getApplicationForAdmin(
  id: string
): Promise<BrandApplicationRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("brand_applications")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getApplicationForAdmin(${id}) failed: ${error.message}`);
  }
  if (!data) return null;
  return toBrandApplicationRecord(data as BrandApplicationRow);
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  is_admin: boolean;
  created_at: string;
}

function toProfileRecord(row: ProfileRow): ProfileRecord {
  return {
    id: row.id,
    fullName: row.full_name ?? undefined,
    email: row.email ?? undefined,
    isAdmin: row.is_admin,
    createdAt: row.created_at,
  };
}

// profiles RLS only allows a user to read their own row — admin's "list
// every account" view needs the service-role client too.
export async function getAllProfilesForAdmin(): Promise<ProfileRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllProfilesForAdmin failed: ${error.message}`);
  }
  return (data as ProfileRow[]).map(toProfileRecord);
}
