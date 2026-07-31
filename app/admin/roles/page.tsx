import { redirect } from "next/navigation";

// Folded into the merged /admin/users page (People + Roles & Permissions
// tabs) — this route stays only so no existing bookmark/link breaks.
export default function AdminRolesRedirectPage() {
  redirect("/admin/users?tab=roles");
}
