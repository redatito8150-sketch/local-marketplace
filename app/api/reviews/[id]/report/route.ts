import { NextRequest,NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit,getClientIp } from "@/lib/rateLimit";
import { reportSchema } from "@/lib/reviews/validation";
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;if(!checkRateLimit(`review-report:${getClientIp(request)}`,5,60_000))return NextResponse.json({error:"Too many reports"},{status:429});
  const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Sign in required"},{status:401});
  const parsed=reportSchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Invalid report"},{status:400});
  const {error}=await supabase.from("review_reports").insert({review_id:id,reporter_user_id:user.id,...parsed.data});
  if(error)return NextResponse.json({error:"This review was already reported or cannot be reported."},{status:409});return NextResponse.json({ok:true},{status:201});
}
