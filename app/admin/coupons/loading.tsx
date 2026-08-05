import ListPageSkeleton from "@/components/admin/ListPageSkeleton";

export default function Loading() {
  return <ListPageSkeleton columns={["text", "text", "text", "badge", "actions"]} />;
}
