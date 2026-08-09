import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { safeErrorResponse } from "@/lib/apiError";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";
import { sendEmail } from "@/lib/email/sendEmail";
import { applicationSubmittedEmail } from "@/lib/email/templates/brandApplication";
import { ApplicationServiceError, submitApplication } from "@/lib/join/applicationService";
import { submitApplicationSchema } from "@/lib/join/validation";
import { brandApplicationSubmitPayloadSchema, structuredErrors } from "@/lib/join/rebuildValidation";
import { submitRebuiltApplication } from "@/lib/join/rebuildService";

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

  const isRebuiltPayload =
    typeof body === "object" && body !== null && "applicationData" in body;
  const parsed = isRebuiltPayload
    ? brandApplicationSubmitPayloadSchema.safeParse(body)
    : submitApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid application data",
        validationErrors: isRebuiltPayload ? structuredErrors(parsed.error) : undefined,
      },
      { status: 400 }
    );
  }

  try {
    const application = isRebuiltPayload
      ? await submitRebuiltApplication(
          user,
          parsed.data as import("@/lib/join/rebuildValidation").BrandApplicationSubmitPayload
        )
      : await submitApplication(
          user.id,
          parsed.data as import("@/lib/join/validation").SubmitApplicationInput
        );

    await notify(
      "brand_application_submitted",
      `New brand application: ${application.brandName}`,
      "A new application is ready for review in the admin portal.",
      { actorLabel: `applicant:${user.id}`, detailLabel: "Status" }
    );
    await logAudit({
      action: "status_change",
      entityType: "application",
      entityId: application.id,
      actorId: user.id,
      actorLabel: `${application.founderName} (${application.email})`,
      after: { status: application.status },
    });
    await sendEmail({ to: application.email, ...applicationSubmittedEmail(application) });

    return NextResponse.json({ application });
  } catch (error) {
    if (error instanceof ApplicationServiceError) {
      const status = error.code === "ALREADY_HAS_ACTIVE_APPLICATION" ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return safeErrorResponse("join.application.submit", error as Error);
  }
}
