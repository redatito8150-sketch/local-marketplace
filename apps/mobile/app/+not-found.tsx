import { useRouter } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { EmptyState } from "@/components/ui/Primitives";

export default function NotFoundRoute() {
  const router = useRouter();
  return (
    <Screen>
      <EmptyState
        title="Page not found"
        message="This destination is unavailable or may have moved."
        actionLabel="Back to Mahaly"
        onAction={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}
