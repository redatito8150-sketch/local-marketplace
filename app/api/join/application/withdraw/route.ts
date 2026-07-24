import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { ApplicationServiceError, withdrawApplication } from "@/lib/join/applicationService";

export async function POST() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const application = await withdrawApplication(user.id);
    await logAudit({
      action: "status_change",
      entityType: "application",
      entityId: application.id,
      actorId: user.id,
      actorLabel: `${application.founderName} (${application.email})`,
      after: { status: "withdrawn" },
    });
    return NextResponse.json({ application });
  } catch (error) {
    if (error instanceof ApplicationServiceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return safeErrorResponse("join.application.withdraw", error as Error);
  }
}
