import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { reviewEditSchema } from "@/lib/reviews/validation";

export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Sign in required"},{status:401});
  const parsed=reviewEditSchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message},{status:400});
  const {data,error}=await supabase.from("reviews").update(parsed.data).eq("id",id).select("id").maybeSingle();
  if(error||!data)return NextResponse.json({error:"Review not found or not owned by you."},{status:403});return NextResponse.json({ok:true});
}
export async function DELETE(_:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Sign in required"},{status:401});
  const {data:images}=await supabaseAdmin.from("review_images").select("storage_path").eq("review_id",id);
  const {data,error}=await supabase.from("reviews").update({deleted_at:new Date().toISOString()}).eq("id",id).select("id").maybeSingle();
  if(error||!data)return NextResponse.json({error:"Review not found or not owned by you."},{status:403});
  if(images?.length)await supabaseAdmin.storage.from("review-images").remove(images.map(image=>image.storage_path));
  return NextResponse.json({ok:true});
}
