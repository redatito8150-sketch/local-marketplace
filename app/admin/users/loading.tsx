import ListPageSkeleton from "@/components/admin/ListPageSkeleton";

export default function Loading() {
  return <ListPageSkeleton withAction={false} columns={["thumbnail", "text", "badge", "actions"]} />;
}
