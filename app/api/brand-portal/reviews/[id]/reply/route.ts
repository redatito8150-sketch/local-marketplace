import { NextRequest,NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { replySchema } from "@/lib/reviews/validation";
export async function PUT(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const context=await requireBrandOwner(request.nextUrl.searchParams.get("brand")??undefined);if(!context?.brandSlug)return NextResponse.json({error:"Forbidden"},{status:403});
 const parsed=replySchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Invalid response"},{status:400});
 const supabase=await createSupabaseServerClient();const {error}=await supabase.from("review_replies").upsert({review_id:id,brand_slug:context.brandSlug,replied_by:context.user.id,body:parsed.data.body},{onConflict:"review_id"});
 if(error)return NextResponse.json({error:"Review does not belong to this brand."},{status:403});return NextResponse.json({ok:true});
}
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const context=await requireBrandOwner(request.nextUrl.searchParams.get("brand")??undefined);if(!context?.brandSlug)return NextResponse.json({error:"Forbidden"},{status:403});
 const supabase=await createSupabaseServerClient();const {error}=await supabase.from("review_replies").delete().eq("review_id",id).eq("brand_slug",context.brandSlug);return error?NextResponse.json({error:"Forbidden"},{status:403}):NextResponse.json({ok:true});
}
