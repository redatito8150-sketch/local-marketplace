import Skeleton, { SkeletonCircle } from "@/components/shared/Skeleton";

type ColumnKind = "thumbnail" | "text" | "badge" | "actions";

// Configurable table placeholder — pass the real column kinds so the
// skeleton's column widths/shapes match the actual table instead of N
// identical generic bars. Used across admin/brand-portal list pages
// (products, orders, applications, users, ...).
export default function TableSkeleton({
  rows = 6,
  columns = ["thumbnail", "text", "text", "badge", "actions"],
}: {
  rows?: number;
  columns?: ColumnKind[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-black/8" aria-hidden>
      <table className="w-full border-collapse">
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex} className="border-b border-black/5 last:border-b-0">
              {columns.map((kind, colIndex) => (
                <td key={colIndex} className="px-4 py-3.5">
                  {renderCell(kind)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(kind: ColumnKind) {
  switch (kind) {
    case "thumbnail":
      return (
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 shrink-0" />
          <Skeleton variant="text" className="h-3.5 w-32" />
        </div>
      );
    case "badge":
      return <Skeleton className="h-6 w-20 rounded-full" />;
    case "actions":
      return (
        <div className="flex justify-end gap-2">
          <SkeletonCircle size={28} />
          <SkeletonCircle size={28} />
        </div>
      );
    case "text":
    default:
      return <Skeleton variant="text" className="h-3.5 w-24" />;
  }
}
