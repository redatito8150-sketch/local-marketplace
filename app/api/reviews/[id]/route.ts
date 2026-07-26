import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { reviewEditSchema } from "@/lib/reviews/validation";
import { getRequestUser } from "@/lib/supabase/requestUser";

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const user=await getRequestUser(request);if(!user)return NextResponse.json({error:"Sign in required"},{status:401});
  const {data}=await supabaseAdmin.from("reviews").select("id,rating,title,body,product_id").eq("id",id).eq("user_id",user.id).is("deleted_at",null).maybeSingle();
  if(!data)return NextResponse.json({error:"Review not found"},{status:404});
  return NextResponse.json({review:data});
}

export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const user=await getRequestUser(request);if(!user)return NextResponse.json({error:"Sign in required"},{status:401});
  const parsed=reviewEditSchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message},{status:400});
  const {data,error}=await supabaseAdmin.from("reviews").update(parsed.data).eq("id",id).eq("user_id",user.id).select("id").maybeSingle();
  if(error||!data)return NextResponse.json({error:"Review not found or not owned by you."},{status:403});return NextResponse.json({ok:true});
}
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const user=await getRequestUser(request);if(!user)return NextResponse.json({error:"Sign in required"},{status:401});
  const {data:images}=await supabaseAdmin.from("review_images").select("storage_path").eq("review_id",id);
  const {data,error}=await supabaseAdmin.from("reviews").update({deleted_at:new Date().toISOString()}).eq("id",id).eq("user_id",user.id).select("id").maybeSingle();
  if(error||!data)return NextResponse.json({error:"Review not found or not owned by you."},{status:403});
  if(images?.length)await supabaseAdmin.storage.from("review-images").remove(images.map(image=>image.storage_path));
  return NextResponse.json({ok:true});
}
