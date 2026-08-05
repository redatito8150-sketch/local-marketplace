import PageHeaderSkeleton from "@/components/shared/PageHeaderSkeleton";
import Skeleton from "@/components/shared/Skeleton";
import TableSkeleton from "@/components/shared/TableSkeleton";

// Composed skeleton for the common admin/brand-portal "list page" shape:
// header, a filter/search bar, and a table. Column kinds are passed
// through to TableSkeleton so each list page can reflect its own real
// columns rather than sharing one hardcoded set.
export default function ListPageSkeleton({
  columns,
  rows = 8,
  withAction = true,
}: {
  columns?: Parameters<typeof TableSkeleton>[0]["columns"];
  rows?: number;
  withAction?: boolean;
}) {
  return (
    <div className="space-y-5" aria-label="Loading list" aria-busy="true">
      <PageHeaderSkeleton withAction={withAction} />
      <Skeleton className="h-11 w-full max-w-sm" />
      <TableSkeleton rows={rows} columns={columns} />
    </div>
  );
}
