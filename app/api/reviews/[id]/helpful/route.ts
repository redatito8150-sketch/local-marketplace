import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/requestUser";
import { supabaseAdmin } from "@/lib/supabase/admin";
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const user=await getRequestUser(request);if(!user)return NextResponse.json({error:"Sign in required"},{status:401});
  const {data:review}=await supabaseAdmin.from("reviews").select("user_id").eq("id",id).eq("status","published").is("deleted_at",null).maybeSingle();
  if(!review||review.user_id===user.id)return NextResponse.json({error:"You cannot vote for this review."},{status:403});
  const {data:existing}=await supabaseAdmin.from("review_helpful_votes").select("review_id").eq("review_id",id).eq("user_id",user.id).maybeSingle();
  if(existing)await supabaseAdmin.from("review_helpful_votes").delete().eq("review_id",id).eq("user_id",user.id);
  else {const {error}=await supabaseAdmin.from("review_helpful_votes").insert({review_id:id,user_id:user.id});if(error)return NextResponse.json({error:"You cannot vote for this review."},{status:403});}
  const {count}=await supabaseAdmin.from("review_helpful_votes").select("*",{count:"exact",head:true}).eq("review_id",id);
  return NextResponse.json({helpful:!existing,count:count??0});
}
