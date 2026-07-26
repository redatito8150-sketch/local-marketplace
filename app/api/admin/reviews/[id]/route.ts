import { NextRequest,NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { moderationSchema } from "@/lib/reviews/validation";
import { logAudit } from "@/lib/auditLog";
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const admin=await requireStaffRole("manager");if(!admin)return NextResponse.json({error:"Forbidden"},{status:403});const {id}=await params;
 const parsed=moderationSchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Invalid action"},{status:400});
 const {data:before}=await supabaseAdmin.from("reviews").select("status,moderation_reason").eq("id",id).maybeSingle();if(!before)return NextResponse.json({error:"Not found"},{status:404});
 const {error}=await supabaseAdmin.from("reviews").update({status:parsed.data.status,moderation_reason:parsed.data.reason??null}).eq("id",id);if(error)return NextResponse.json({error:error.message},{status:500});
 await logAudit({actorId:admin.user.id,actorLabel:admin.user.email??"Admin",entityType:"review",entityId:id,action:"moderate_review",before,after:parsed.data});
 return NextResponse.json({ok:true});
}
