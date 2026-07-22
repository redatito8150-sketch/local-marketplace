import { notFound, redirect } from "next/navigation";
import PageStudioEditor from "@/components/admin/PageStudioEditor";
import { getDraftPageSections, getPageVersions } from "@/lib/data/pageStudio";
import { requireStaffRole } from "@/lib/supabase/adminAuth";

const SUPPORTED_PAGES = new Set(["home"]);

export default async function PageStudioEditorPage(props: { params: Promise<{ pageKey: string }> }) {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");
  const { pageKey } = await props.params;
  if (!SUPPORTED_PAGES.has(pageKey)) notFound();

  const [sections, versions] = await Promise.all([
    getDraftPageSections(pageKey),
    getPageVersions(pageKey),
  ]);
  if (!sections.length) notFound();

  return <PageStudioEditor pageKey={pageKey} initialSections={sections} versions={versions} />;
}
