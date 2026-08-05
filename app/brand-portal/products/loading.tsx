import ListPageSkeleton from "@/components/admin/ListPageSkeleton";

export default function Loading() {
  return <ListPageSkeleton columns={["thumbnail", "text", "text", "badge", "actions"]} />;
}
