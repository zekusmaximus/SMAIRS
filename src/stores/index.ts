import React, { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export { useManuscriptStore } from "./manuscript.store";
export { useAnalysisStore } from "./analysis.store";
export { useDecisionStore } from "./decision.store";

let queryClient: QueryClient | null = null;
function getClient() {
  if (!queryClient) queryClient = new QueryClient();
  return queryClient;
}

export function StoreProvider({ children }: PropsWithChildren) {
  return React.createElement(QueryClientProvider, { client: getClient() }, children);
}
