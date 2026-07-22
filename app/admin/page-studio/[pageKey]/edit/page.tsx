import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye, Send } from "lucide-react";
import PageStudioHomepage from "@/components/home/PageStudioHomepage";
import { getDraftPageSections } from "@/lib/data/pageStudio";
import { requireStaffRole } from "@/lib/supabase/adminAuth";

export default async function StorefrontEditMode(props: { params: Promise<{ pageKey: string }> }) {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");
  const { pageKey } = await props.params;
  if (pageKey !== "home") notFound();
  const sections = await getDraftPageSections(pageKey);
  return <div><div className="sticky top-0 z-[120] flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-[#fff8f6] px-4 py-2 text-xs text-ink shadow-soft"><div className="flex items-center gap-3"><Link href={`/admin/page-studio/${pageKey}`} className="inline-flex items-center gap-1.5 font-bold"><ArrowLeft className="h-4 w-4" /> Exit Edit Mode</Link><span className="hidden text-ink-soft/60 sm:inline">Hover or focus a section to reveal controls.</span></div><div className="flex items-center gap-2"><Link href={`/admin/page-studio/${pageKey}/preview`} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 font-bold"><Eye className="h-4 w-4" /> Preview</Link><Link href={`/admin/page-studio/${pageKey}`} className="inline-flex items-center gap-1.5 rounded-lg bg-mahalyred px-3 py-2 font-bold text-white"><Send className="h-4 w-4" /> Review & publish</Link></div></div><PageStudioHomepage sections={sections} editMode /></div>;
}
