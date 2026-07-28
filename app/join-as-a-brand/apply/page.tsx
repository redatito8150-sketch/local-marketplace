import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import BrandApplicationExperience from "@/components/join/BrandApplicationExperience";
import { requireUser } from "@/lib/supabase/accountAuth";
import {
  getApplicantAccountSnapshot,
  getMyApplication,
} from "@/lib/join/applicationService";

export const metadata: Metadata = {
  title: "Apply to Sell on Mahaly | Join Mahaly",
  description:
    "Submit your brand application to start selling on Mahaly, Egypt's marketplace for independent local brands.",
};

export default async function ApplyBrandPage() {
  const user = await requireUser();
  if (!user) redirect("/account");

  const application = await getMyApplication(user.id);
  const accountSnapshot =
    application?.applicantAccountSnapshot ?? (await getApplicantAccountSnapshot(user));

  return (
    <main className="min-h-screen bg-[#fdfcfb]">
      <Header />
      <BrandApplicationExperience
        initialApplication={application}
        accountSnapshot={accountSnapshot}
      />
    </main>
  );
}
