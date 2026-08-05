import ListPageSkeleton from "@/components/admin/ListPageSkeleton";

export default function Loading() {
  return <ListPageSkeleton withAction={false} columns={["text", "text", "text", "badge", "actions"]} />;
}
