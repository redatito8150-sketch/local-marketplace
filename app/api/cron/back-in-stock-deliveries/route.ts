import { NextRequest, NextResponse } from "next/server";
import { processBackInStockDeliveries } from "@/lib/backInStock";
import { safeErrorResponse } from "@/lib/apiError";

// Durable retry/drain path for pending deliveries and expired worker leases.
// Inventory mutations still invoke the same worker immediately for low
// latency, while this authenticated cron guarantees progress after a crash or
// transient provider failure even if no later inventory event occurs.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const result = await processBackInStockDeliveries();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return safeErrorResponse("cron.back-in-stock-deliveries", error as Error);
  }
}
