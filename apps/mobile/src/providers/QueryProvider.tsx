import { PropsWithChildren, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry: 2, refetchOnReconnect: true }
    }
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
