import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { prepareSafeImageUpload, type PreparedImageUpload } from "@/lib/uploads/imageValidation";
import { reviewInputSchema, toReviewInsert } from "@/lib/reviews/validation";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getEligibleOrderItems, getPublicReviews } from "@/lib/reviews/data";
import { getRequestUser } from "@/lib/supabase/requestUser";
import { logError } from "@/lib/errorLog";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const rating = Number(params.get("rating"));
  const result = await getPublicReviews({
    brandSlug: params.get("brandSlug") || undefined,
    productId: params.get("productId") || undefined,
    filters: {
      photos: params.get("photos") === "true",
      verified: false,
      replied: params.get("replied") === "true",
      sort: "recent",
      page,
      rating: rating >= 1 && rating <= 5 ? rating : undefined
    }
  });
  const user = await getRequestUser(request);
  const eligibleItems = user ? await getEligibleOrderItems(user.id, params.get("productId") || undefined, params.get("brandSlug") || undefined) : [];
  let reviews = result.reviews.map((review) => ({ ...review, isOwn: false }));
  if (user && reviews.length) {
    const ids = reviews.map((review) => review.id);
    const [{ data: ownRows }, { data: votes }] = await Promise.all([
      supabaseAdmin.from("reviews").select("id").eq("user_id", user.id).in("id", ids),
      supabaseAdmin.from("review_helpful_votes").select("review_id").eq("user_id", user.id).in("review_id", ids)
    ]);
    const own = new Set((ownRows ?? []).map((row) => row.id));
    const helpful = new Set((votes ?? []).map((row) => row.review_id));
    reviews = reviews.map((review) => ({ ...review, isOwn: own.has(review.id), viewerFoundHelpful: helpful.has(review.id) }));
  }
  return NextResponse.json({ ...result, reviews, eligibleItems });
}

export async function POST(request: NextRequest) {
  if (!checkRateLimit(`review:${getClientIp(request)}`, 8, 60_000)) return NextResponse.json({error:"Too many requests"},{status:429});
  const user = await getRequestUser(request);
  if(!user)return NextResponse.json({error:"Sign in required"},{status:401});
  const form = await request.formData() as unknown as {
    get(name: string): string | File | null;
    getAll(name: string): (string | File)[];
  };
  const parsed=reviewInputSchema.safeParse({productId:form.get("productId"),orderItemId:form.get("orderItemId"),rating:form.get("rating"),title:form.get("title"),body:form.get("body")});
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message},{status:400});
  const files=form.getAll("images").filter((item):item is File=>typeof item !== "string"&&item.size>0);
  if(files.length>5)return NextResponse.json({error:"Up to 5 images are allowed."},{status:400});
  const preparedFiles: PreparedImageUpload[]=[];
  for(const file of files){
    const prepared=await prepareSafeImageUpload(file,{allowedMimeTypes:["image/jpeg","image/png","image/webp"],maxBytes:5*1024*1024});
    if(!prepared.ok)return NextResponse.json({error:prepared.error},{status:400});
    preparedFiles.push(prepared.upload);
  }
  const { data: eligible, error: eligibilityError } = await supabaseAdmin.rpc("review_purchase_is_eligible", {
    p_user_id: user.id,
    p_product_id: parsed.data.productId,
    p_order_item_id: parsed.data.orderItemId,
  });
  if (eligibilityError) {
    return NextResponse.json({ error: "We could not verify this purchase. Please try again." }, { status: 500 });
  }
  if (!eligible) {
    return NextResponse.json({ error: "This item can only be reviewed after its order is fulfilled." }, { status: 403 });
  }

  const {data:review,error}=await supabaseAdmin.from("reviews").insert(toReviewInsert(user.id, parsed.data)).select("id").single();
  if(error){
    if(error.code==="23505")return NextResponse.json({error:"This purchase has already been reviewed."},{status:409});
    logError("reviews.create", error.message);
    return NextResponse.json({error:"Your review could not be published. Please try again."},{status:500});
  }
  const uploaded:string[]=[];
  try{
    for(let index=0;index<preparedFiles.length;index++){const file=preparedFiles[index];const path=`${user.id}/${review.id}/${randomUUID()}.${file.extension}`;
      const upload=await supabaseAdmin.storage.from("review-images").upload(path,file.bytes,{contentType:file.mimeType,upsert:false});if(upload.error)throw upload.error;uploaded.push(path);
      const imageRow=await supabaseAdmin.from("review_images").insert({review_id:review.id,storage_path:path,display_order:index});if(imageRow.error)throw imageRow.error;
    }
  }catch(error){if(uploaded.length)await supabaseAdmin.storage.from("review-images").remove(uploaded);await supabaseAdmin.from("reviews").update({deleted_at:new Date().toISOString()}).eq("id",review.id);return NextResponse.json({error:"Images could not be saved."},{status:500});}
  await supabaseAdmin.from("notifications").insert({
    type: parsed.data.rating <= 2 ? "low_rating_review" : "new_review",
    title: parsed.data.rating <= 2 ? "New low-rating review" : "New verified review",
    body: `A customer published a ${parsed.data.rating}-star verified review.`,
    related_entity_type: "review",
    related_entity_id: review.id,
  });
  return NextResponse.json({id:review.id},{status:201});
}
