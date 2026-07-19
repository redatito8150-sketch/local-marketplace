import { redirect } from "next/navigation";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import JournalArticleForm from "@/components/admin/JournalArticleForm";

export default async function NewJournalArticlePage() {
  const staff = await requireStaffRole("manager");
  if (!staff) redirect("/admin");

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold tracking-tightest text-ink">New article</h1>
      <JournalArticleForm mode="create" />
    </div>
  );
}
