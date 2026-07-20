import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import type { BrandApplicationInput } from "@/lib/join/submitApplication";

function validateApplicationInput(body: BrandApplicationInput): string | null {
  if (!body.brandName?.trim()) return "Brand name is required";
  if (!body.founderName?.trim()) return "Founder name is required";
  if (!body.email?.trim()) return "Email is required";
  if (!body.phone?.trim()) return "Phone is required";
  if (!body.instagramOrWebsite?.trim()) return "Instagram or website is required";
  if (!body.productCategory?.trim()) return "Product category is required";
  if (!body.brandStory?.trim()) return "Brand story is required";
  if (!body.salesChannels?.trim()) return "Sales channels are required";
  return null;
}

// Public route — applying to sell on Local doesn't require an account,
// same reasoning as guest checkout. Still never touches the anon key:
// the insert goes through the service-role client, matching every other
// write in this project.
export async function POST(request: NextRequest) {
  let body: BrandApplicationInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const validationError = validateApplicationInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("brand_applications").insert({
    brand_name: body.brandName,
    founder_name: body.founderName,
    email: body.email,
    phone: body.phone,
    instagram_or_website: body.instagramOrWebsite,
    product_category: body.productCategory,
    brand_story: body.brandStory,
    sales_channels: body.salesChannels,
  });

  if (error) {
    return NextResponse.json(
      { error: `Failed to submit application: ${error.message}` },
      { status: 500 }
    );
  }

  await notify(
    "brand_application_submitted",
    `New brand application: ${body.brandName}`,
    body.brandStory,
    { actorLabel: `${body.founderName} (${body.email})`, detailLabel: "Brand Story" }
  );

  return NextResponse.json({ ok: true });
}
