import { notFound, redirect } from "next/navigation";
import PageStudioHomepage from "@/components/home/PageStudioHomepage";
import { getDraftPageSections } from "@/lib/data/pageStudio";
import { requireStaffRole } from "@/lib/supabase/adminAuth";

export default async function PageStudioPreview(props: { params: Promise<{ pageKey: string }> }) {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");
  const { pageKey } = await props.params;
  if (pageKey !== "home") notFound();
  const sections = await getDraftPageSections(pageKey);
  return <div><div className="sticky top-0 z-[100] flex items-center justify-center bg-amber-100 px-4 py-2 text-center text-xs font-bold text-amber-950">Draft preview · Only authorized staff can see this page</div><PageStudioHomepage sections={sections} /></div>;
}
