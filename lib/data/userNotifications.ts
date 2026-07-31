import { supabaseAdmin } from "@/lib/supabase/admin";
import type { UserNotificationRecord } from "@/types";

interface UserNotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
}

function toUserNotificationRecord(row: UserNotificationRow): UserNotificationRecord {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    read: row.read,
    createdAt: row.created_at,
    relatedEntityType: row.related_entity_type ?? undefined,
    relatedEntityId: row.related_entity_id ?? undefined,
  };
}

// Same "supabaseAdmin + explicit user_id filter" convention as every other
// own-account read in lib/data/ (addresses, orders, wishlist) — RLS is a
// backstop, not the only line of defense, when reading from a Server
// Component.
export async function getNotificationsForUser(userId: string, limit = 20): Promise<UserNotificationRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("user_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getNotificationsForUser failed: ${error.message}`);
  }
  return (data as UserNotificationRow[]).map(toUserNotificationRecord);
}

export async function getUnreadNotificationCountForUser(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);

  if (error) {
    throw new Error(`getUnreadNotificationCountForUser failed: ${error.message}`);
  }
  return count ?? 0;
}
