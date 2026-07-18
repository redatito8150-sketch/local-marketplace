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

// Kept isolated from ApplyBrandForm on purpose (see app/api/join/apply/route.ts)
// so the form component never needed to change when this stopped being a stub.
export async function submitBrandApplication(
  input: BrandApplicationInput
): Promise<{ ok: true }> {
  const res = await fetch("/api/join/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to submit application");
  }

  return { ok: true };
}
