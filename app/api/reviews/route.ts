import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasExpectedImageSignature } from "@/lib/uploads/imageValidation";
import { reviewInputSchema, toReviewInsert } from "@/lib/reviews/validation";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  if (!checkRateLimit(`review:${getClientIp(request)}`, 8, 60_000)) return NextResponse.json({error:"Too many requests"},{status:429});
  const supabase = await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Sign in required"},{status:401});
  const form = await request.formData() as unknown as {
    get(name: string): string | File | null;
    getAll(name: string): (string | File)[];
  };
  const parsed=reviewInputSchema.safeParse({productId:form.get("productId"),orderItemId:form.get("orderItemId"),rating:form.get("rating"),title:form.get("title"),body:form.get("body")});
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message},{status:400});
  const files=form.getAll("images").filter((item):item is File=>typeof item !== "string"&&item.size>0);
  if(files.length>5)return NextResponse.json({error:"Up to 5 images are allowed."},{status:400});
  for(const file of files)if(file.size>5*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type)||!await hasExpectedImageSignature(file))return NextResponse.json({error:"Images must be JPG, PNG, or WebP and no larger than 5MB."},{status:400});
  const { data: eligible, error: eligibilityError } = await supabase.rpc("review_purchase_is_eligible", {
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

  const {data:review,error}=await supabase.from("reviews").insert(toReviewInsert(user.id, parsed.data)).select("id").single();
  if(error){
    if(error.code==="23505")return NextResponse.json({error:"This purchase has already been reviewed."},{status:409});
    console.error("Review creation failed", { code: error.code, message: error.message });
    return NextResponse.json({error:"Your review could not be published. Please try again."},{status:500});
  }
  const uploaded:string[]=[];
  try{
    for(let index=0;index<files.length;index++){const file=files[index];const ext=file.type.split("/")[1];const path=`${user.id}/${review.id}/${randomUUID()}.${ext}`;
      const upload=await supabaseAdmin.storage.from("review-images").upload(path,file,{contentType:file.type,upsert:false});if(upload.error)throw upload.error;uploaded.push(path);
      const imageRow=await supabase.from("review_images").insert({review_id:review.id,storage_path:path,display_order:index});if(imageRow.error)throw imageRow.error;
    }
  }catch(error){if(uploaded.length)await supabaseAdmin.storage.from("review-images").remove(uploaded);await supabase.from("reviews").update({deleted_at:new Date().toISOString()}).eq("id",review.id);return NextResponse.json({error:"Images could not be saved."},{status:500});}
  await supabaseAdmin.from("notifications").insert({
    type: parsed.data.rating <= 2 ? "low_rating_review" : "new_review",
    title: parsed.data.rating <= 2 ? "New low-rating review" : "New verified review",
    body: `A customer published a ${parsed.data.rating}-star verified review.`,
    related_entity_type: "review",
    related_entity_id: review.id,
  });
  return NextResponse.json({id:review.id},{status:201});
}
