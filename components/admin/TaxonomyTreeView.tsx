import type { TaxonomyNode } from "@/types";

// Read-only display of the full Main Category -> Product Group -> Product
// Type hierarchy for /admin/products/categories — parent relationship
// (nesting), active status, and sort order are all visible here. Not an
// editor: taxonomy_nodes is managed via migrations/seed data, not a CRUD
// UI, per this round's "don't build a whole new taxonomy app" scope.
export default function TaxonomyTreeView({ nodes }: { nodes: TaxonomyNode[] }) {
  const mains = nodes.filter((n) => n.level === 1).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-5">
      {mains.map((main) => {
        const groups = nodes
          .filter((n) => n.level === 2 && n.parentId === main.id)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <details key={main.id} className="rounded-xl3 border border-stone-150 bg-white">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-[14px] font-bold text-ink">
              <span>{main.name}</span>
              <StatusBadges node={main} childCount={groups.length} childLabel="groups" />
            </summary>
            <div className="border-t border-stone-150 p-4 space-y-3">
              {groups.map((group) => {
                const types = nodes
                  .filter((n) => n.level === 3 && n.parentId === group.id)
                  .sort((a, b) => a.sortOrder - b.sortOrder);
                return (
                  <details key={group.id} className="rounded-lg border border-stone-100 bg-stone-50/60">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] font-semibold text-ink">
                      <span>{group.name}</span>
                      <StatusBadges node={group} childCount={types.length} childLabel="types" />
                    </summary>
                    <ul className="space-y-1 border-t border-stone-150 p-3.5">
                      {types.map((type) => (
                        <li key={type.id} className="flex items-center justify-between gap-3 text-[12.5px] text-ink-soft/80">
                          <span>{type.name}</span>
                          <StatusBadges node={type} />
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function StatusBadges({
  node,
  childCount,
  childLabel,
}: {
  node: TaxonomyNode;
  childCount?: number;
  childLabel?: string;
}) {
  return (
    <span className="flex shrink-0 items-center gap-2 text-[11px] font-medium text-ink-soft/50">
      {typeof childCount === "number" && (
        <span>{childCount} {childLabel}</span>
      )}
      <span>Sort {node.sortOrder}</span>
      <span className={`rounded-full px-2 py-0.5 font-bold uppercase tracking-wide ${node.isActive ? "bg-emerald-50 text-emerald-700" : "bg-stone-150 text-ink-soft/50"}`}>
        {node.isActive ? "Active" : "Inactive"}
      </span>
    </span>
  );
}
