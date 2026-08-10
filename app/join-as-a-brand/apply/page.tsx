import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ApplyBrandForm from "@/components/join/ApplyBrandForm";
import { requireUser } from "@/lib/supabase/accountAuth";
import { getMyApplication, isWithinReapplicationCooldown } from "@/lib/join/applicationService";

export const metadata: Metadata = {
  title: "Apply to Sell on Zakhnook | Join Zakhnook",
  description:
    "Submit your brand application to start selling on Zakhnook, Egypt's marketplace for independent local brands.",
};

// Starting/resuming an application requires an account — same gate as
// /account/(dashboard), redirecting to the sign-in page rather than
// rendering a form that can't be submitted. The public intro page
// (/join-as-a-brand) stays unauthenticated.
export default async function ApplyBrandPage() {
  const user = await requireUser();
  if (!user) redirect("/account");

  const application = await getMyApplication(user.id);
  const cooldownActive = application ? isWithinReapplicationCooldown(application) : false;

  return (
    <main className="flex min-h-screen flex-col [&>*]:w-full bg-cream">
      <Header />
      <section className="mx-auto max-w-[1120px] px-5 py-10 sm:px-8 lg:py-14">
        <div className="mb-8 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-mahalyred">
          Join Zakhnook
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink lg:text-[42px]">
          Apply to sell on Zakhnook
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-ink-soft/65">
          Tell us about your brand — we review every application personally.
        </p>
        </div>
        <div className="rounded-[28px] border border-black/[0.07] bg-white px-5 py-7 shadow-[0_20px_60px_rgba(33,26,22,.07)] sm:px-8 lg:px-12 lg:py-10">
          <ApplyBrandForm initialApplication={application} initialCooldownActive={cooldownActive} />
        </div>
      </section>
      <Footer homeGradient />
    </main>
  );
}
