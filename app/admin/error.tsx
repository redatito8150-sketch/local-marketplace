"use client";

import DashboardError from "@/components/dashboard/DashboardError";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <DashboardError reset={reset} title="Admin dashboard unavailable" />;
}
