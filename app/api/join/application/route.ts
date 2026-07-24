import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { safeErrorResponse } from "@/lib/apiError";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  ApplicationServiceError,
  createOrUpdateDraft,
  getApplicantAccountSnapshot,
  getMyApplication,
  isWithinReapplicationCooldown,
} from "@/lib/join/applicationService";
import { draftApplicationSchema } from "@/lib/join/validation";

// Own application (or null if none exists yet) + whether a reapplication
// cooldown is currently blocking a new one.
export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  try {
    const application = await getMyApplication(user.id);
    return NextResponse.json({
      application,
      cooldownActive: application ? isWithinReapplicationCooldown(application) : false,
    });
  } catch (error) {
    return safeErrorResponse("join.application.get", error as Error);
  }
}

// Create or update the applicant's draft (or changes_requested) application.
// applicant_user_id and the account snapshot are always derived server-side
// from the session — never accepted from the request body.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  if (!checkRateLimit(`join-application-draft:${getClientIp(request)}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — try again later" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = draftApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid application data" },
      { status: 400 }
    );
  }

  try {
    const snapshot = await getApplicantAccountSnapshot(user);
    const application = await createOrUpdateDraft(user.id, snapshot, parsed.data);
    return NextResponse.json({ application });
  } catch (error) {
    if (error instanceof ApplicationServiceError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return safeErrorResponse("join.application.post", error as Error);
  }
}
