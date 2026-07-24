import { emailShell } from "@/lib/email/templates/shared";
import type { BrandApplicationRecord } from "@/types";

// One template per applicant-facing lifecycle transition — kept in a
// single file (unlike the per-transition order templates) since these are
// short and share the exact same shape (a headline + one paragraph),
// rather than each needing its own file.

export function applicationSubmittedEmail(app: BrandApplicationRecord) {
  return {
    subject: `We received your application — ${app.brandName}`,
    html: emailShell(`
      <h1 style="font-size: 18px; margin: 0 0 8px;">Application received</h1>
      <p style="font-size: 14px; color: #4a463c; margin: 0 0 20px;">
        Thanks for applying to sell ${app.brandName} on Mahaly. Our team reviews every
        application and will follow up by email within a few business days.
      </p>
    `),
  };
}

export function applicationUnderReviewEmail(app: BrandApplicationRecord) {
  return {
    subject: `Your application is under review — ${app.brandName}`,
    html: emailShell(`
      <h1 style="font-size: 18px; margin: 0 0 8px;">Your application is under review</h1>
      <p style="font-size: 14px; color: #4a463c; margin: 0 0 20px;">
        Our team is currently reviewing your application for ${app.brandName}. We'll be in
        touch as soon as there's an update.
      </p>
    `),
  };
}

export function applicationChangesRequestedEmail(app: BrandApplicationRecord, message: string) {
  return {
    subject: `Changes requested on your application — ${app.brandName}`,
    html: emailShell(`
      <h1 style="font-size: 18px; margin: 0 0 8px;">We need a few changes</h1>
      <p style="font-size: 14px; color: #4a463c; margin: 0 0 12px;">
        Before we can move forward with your application for ${app.brandName}, please address
        the following:
      </p>
      <p style="font-size: 14px; color: #1a1a1a; margin: 0 0 20px; padding: 12px 14px; background: #f7f4ee; border-radius: 6px;">
        ${message}
      </p>
      <p style="font-size: 14px; color: #4a463c; margin: 0;">
        Sign in and update your application whenever you're ready to resubmit.
      </p>
    `),
  };
}

export function applicationApprovedEmail(app: BrandApplicationRecord) {
  return {
    subject: `You're approved — ${app.brandName}`,
    html: emailShell(`
      <h1 style="font-size: 18px; margin: 0 0 8px;">Congratulations — you're approved!</h1>
      <p style="font-size: 14px; color: #4a463c; margin: 0 0 20px;">
        Your application for ${app.brandName} has been approved. We're setting up your brand
        page now and will let you know as soon as it's live.
      </p>
    `),
  };
}

export function applicationRejectedEmail(app: BrandApplicationRecord, reason: string) {
  return {
    subject: `Update on your application — ${app.brandName}`,
    html: emailShell(`
      <h1 style="font-size: 18px; margin: 0 0 8px;">Application update</h1>
      <p style="font-size: 14px; color: #4a463c; margin: 0 0 12px;">
        After review, we're not able to move forward with your application for
        ${app.brandName} at this time.
      </p>
      <p style="font-size: 14px; color: #1a1a1a; margin: 0 0 20px; padding: 12px 14px; background: #f7f4ee; border-radius: 6px;">
        ${reason}
      </p>
      <p style="font-size: 14px; color: #4a463c; margin: 0;">
        You're welcome to apply again once the review period noted in your account has passed.
      </p>
    `),
  };
}

export function applicationBrandCreatedEmail(app: BrandApplicationRecord) {
  return {
    subject: `Your brand page is live — ${app.brandName}`,
    html: emailShell(`
      <h1 style="font-size: 18px; margin: 0 0 8px;">Your brand page is live</h1>
      <p style="font-size: 14px; color: #4a463c; margin: 0;">
        ${app.brandName} is now live on Mahaly. Sign in to your account to start managing your
        products and orders from the Brand Portal.
      </p>
    `),
  };
}
