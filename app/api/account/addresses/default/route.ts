import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { getDefaultAddressForUser } from "@/lib/data/addresses";

// Used by checkout's one-time prefill effect for signed-in shoppers.
export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ address: null });
  }

  const address = await getDefaultAddressForUser(user.id);
  return NextResponse.json({ address });
}
