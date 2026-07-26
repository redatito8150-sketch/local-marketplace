import { NextRequest, NextResponse } from "next/server";
import { getOrdersForUser } from "@/lib/data/orders";
import { getRequestUser } from "@/lib/supabase/requestUser";

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { id } = await props.params;
  const order = (await getOrdersForUser(user.id)).find((candidate) => candidate.id === id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ order });
}
