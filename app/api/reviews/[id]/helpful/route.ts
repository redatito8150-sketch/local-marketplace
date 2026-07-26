import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Sign in required"},{status:401});
  const {data:existing}=await supabase.from("review_helpful_votes").select("review_id").eq("review_id",id).eq("user_id",user.id).maybeSingle();
  if(existing)await supabase.from("review_helpful_votes").delete().eq("review_id",id).eq("user_id",user.id);
  else {const {error}=await supabase.from("review_helpful_votes").insert({review_id:id,user_id:user.id});if(error)return NextResponse.json({error:"You cannot vote for this review."},{status:403});}
  const {count}=await supabase.from("review_helpful_votes").select("*",{count:"exact",head:true}).eq("review_id",id);
  return NextResponse.json({helpful:!existing,count:count??0});
}
