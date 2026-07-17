export interface BrandApplicationInput {
  brandName: string;
  founderName: string;
  email: string;
  phone: string;
  instagramOrWebsite: string;
  productCategory: string;
  brandStory: string;
  salesChannels: string;
}

// Deliberately not wired to Supabase yet — no application table exists.
// Isolated here so a real API route can replace this body later without
// ApplyBrandForm needing to change at all.
export async function submitBrandApplication(
  input: BrandApplicationInput
): Promise<{ ok: true }> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return { ok: true };
}
