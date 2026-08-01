import { NextRequest,NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { replySchema } from "@/lib/reviews/validation";
import { logAudit } from "@/lib/auditLog";
export async function PUT(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const context=await requireBrandOwner(request.nextUrl.searchParams.get("brand")??undefined);if(!context?.brandSlug)return NextResponse.json({error:"Forbidden"},{status:403});
 const parsed=replySchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Invalid response"},{status:400});
 const supabase=await createSupabaseServerClient();const {error}=await supabase.from("review_replies").upsert({review_id:id,brand_slug:context.brandSlug,replied_by:context.user.id,body:parsed.data.body},{onConflict:"review_id"});
 if(error)return NextResponse.json({error:"Review does not belong to this brand."},{status:403});
 await logAudit({actorId:context.user.id,actorLabel:context.user.email??context.user.id,entityType:"review",entityId:id,action:"update",after:{body:parsed.data.body},brandSlug:context.brandSlug});
 return NextResponse.json({ok:true});
}
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const context=await requireBrandOwner(request.nextUrl.searchParams.get("brand")??undefined);if(!context?.brandSlug)return NextResponse.json({error:"Forbidden"},{status:403});
 const supabase=await createSupabaseServerClient();const {error}=await supabase.from("review_replies").delete().eq("review_id",id).eq("brand_slug",context.brandSlug);
 if(error)return NextResponse.json({error:"Forbidden"},{status:403});
 await logAudit({actorId:context.user.id,actorLabel:context.user.email??context.user.id,entityType:"review",entityId:id,action:"delete",brandSlug:context.brandSlug});
 return NextResponse.json({ok:true});
}
