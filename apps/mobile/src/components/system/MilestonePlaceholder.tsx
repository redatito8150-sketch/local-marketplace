import { Screen } from "@/components/ui/Screen";
import { EmptyState } from "@/components/ui/Primitives";

export function MilestonePlaceholder({ name, milestone }: { name: string; milestone: number }) {
  return (
    <Screen>
      <EmptyState
        title={name}
        message={`Navigation is ready. Customer content will be connected to Mahaly data in Milestone ${milestone}.`}
      />
    </Screen>
  );
}
