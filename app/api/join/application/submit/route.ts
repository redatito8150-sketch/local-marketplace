import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { safeErrorResponse } from "@/lib/apiError";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";
import { ApplicationServiceError, submitApplication } from "@/lib/join/applicationService";
import { submitApplicationSchema } from "@/lib/join/validation";

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  if (!checkRateLimit(`join-application-submit:${getClientIp(request)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — try again later" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = submitApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid application data" },
      { status: 400 }
    );
  }

  try {
    const application = await submitApplication(user.id, parsed.data);

    await notify(
      "brand_application_submitted",
      `New brand application: ${application.brandName}`,
      application.brandStory,
      { actorLabel: `${application.founderName} (${application.email})`, detailLabel: "Brand Story" }
    );
    await logAudit({
      action: "status_change",
      entityType: "application",
      entityId: application.id,
      actorId: user.id,
      actorLabel: `${application.founderName} (${application.email})`,
      after: { status: application.status },
    });

    return NextResponse.json({ application });
  } catch (error) {
    if (error instanceof ApplicationServiceError) {
      const status = error.code === "ALREADY_HAS_ACTIVE_APPLICATION" ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return safeErrorResponse("join.application.submit", error as Error);
  }
}
