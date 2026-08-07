"use client";

import Link from "next/link";
import { Check, Clock, MessageSquare, PartyPopper, XCircle } from "lucide-react";
import type { BrandApplicationRecord } from "@/types";
import { formatDateOnly } from "@/lib/format";

const STATUS_COPY: Partial<Record<BrandApplicationRecord["status"], { title: string; body: string }>> = {
  submitted: {
    title: "Application received",
    body: "Thank you for applying to sell on Mahaly. Our team reviews every application and will reach out by email within a few business days.",
  },
  under_review: {
    title: "Your application is under review",
    body: "Our team is currently reviewing your application. We'll email you as soon as there's an update.",
  },
  resubmitted: {
    title: "Updated application received",
    body: "Thanks for making the requested changes. Our team will review your updated application shortly.",
  },
  approved_pending_creation: {
    title: "Application approved",
    body: "Congratulations — your application has been approved. Your brand page is being set up and you'll be notified once it's live.",
  },
  approved: {
    title: "Application approved",
    body: "Congratulations — your application has been approved. Your brand page is being set up and you'll be notified once it's live.",
  },
  withdrawn: {
    title: "Application withdrawn",
    body: "You withdrew this application. You're welcome to start a new one whenever you're ready.",
  },
  converted_to_brand: {
    title: "Your brand is live",
    body: "Your application was approved and your brand page has been created.",
  },
};

function iconFor(status: BrandApplicationRecord["status"]) {
  if (status === "rejected") return <XCircle className="h-6 w-6" strokeWidth={1.8} />;
  if (status === "changes_requested") return <MessageSquare className="h-6 w-6" strokeWidth={1.8} />;
  if (status === "approved" || status === "approved_pending_creation") {
    return <PartyPopper className="h-6 w-6" strokeWidth={1.8} />;
  }
  if (status === "converted_to_brand") return <Check className="h-6 w-6" strokeWidth={1.8} />;
  return <Clock className="h-6 w-6" strokeWidth={1.8} />;
}

export default function ApplicationStatusView({
  application,
  cooldownActive,
  onWithdraw,
  onStartNew,
  withdrawing,
}: {
  application: BrandApplicationRecord;
  cooldownActive: boolean;
  onWithdraw: () => void;
  onStartNew: () => void;
  withdrawing: boolean;
}) {
  const { status } = application;
  const copy = STATUS_COPY[status];
  const isRejected = status === "rejected";
  const canWithdraw = status === "submitted" || status === "under_review" || status === "resubmitted";

  return (
    <div className="flex max-w-lg flex-col items-start py-6">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-full ${
          isRejected ? "bg-red-50 text-red-600" : "bg-mahalyred text-cream"
        }`}
      >
        {iconFor(status)}
      </div>

      <h1 className="mt-6 font-serif text-2xl font-semibold text-ink">
        {isRejected ? "Application not approved" : copy?.title ?? "Application status"}
      </h1>

      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-soft/70">
        {isRejected
          ? application.rejectionReason ??
            "Unfortunately your application wasn't approved this time."
          : copy?.body ?? `Your application is currently "${status}".`}
      </p>

      {status === "converted_to_brand" && application.approvedBrandId && (
        <Link
          href={`/brands/${application.approvedBrandId}`}
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-mahalyred px-6 py-3 text-sm font-semibold text-cream transition-transform hover:scale-[1.03]"
        >
          View your brand page
        </Link>
      )}

      {canWithdraw && (
        <button
          type="button"
          onClick={onWithdraw}
          disabled={withdrawing}
          className="mt-7 inline-flex items-center gap-2 rounded-full border border-stone-200 px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {withdrawing ? "Withdrawing…" : "Withdraw application"}
        </button>
      )}

      {(isRejected || status === "withdrawn") && (
        <>
          {isRejected && cooldownActive && (
            <p className="mt-5 text-[13px] font-medium text-ink-soft/60">
              You can submit a new application after{" "}
              {application.reapplicationAllowedAt
                ? formatDateOnly(application.reapplicationAllowedAt)
                : "the review cooldown ends"}
              .
            </p>
          )}
          {!(isRejected && cooldownActive) && (
            <button
              type="button"
              onClick={onStartNew}
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-mahalyred px-6 py-3 text-sm font-semibold text-cream transition-transform hover:scale-[1.03]"
            >
              Start a new application
            </button>
          )}
        </>
      )}

      <Link
        href="/"
        className="mt-4 text-[13px] font-medium text-ink-soft/60 underline-offset-2 hover:underline"
      >
        Back to Mahaly
      </Link>
    </div>
  );
}
