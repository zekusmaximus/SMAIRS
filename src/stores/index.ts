import React, { PropsWithChildren, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePreferences, applyTheme } from "./preferences.store";

export { useManuscriptStore } from "./manuscript.store";
export { useAnalysisStore } from "./analysis.store";
export { useDecisionStore } from "./decision.store";

let queryClient: QueryClient | null = null;
function getClient() {
  if (!queryClient) queryClient = new QueryClient();
  return queryClient;
}

export function StoreProvider({ children }: PropsWithChildren) {
  const loadPrefs = usePreferences((s) => s.load);
  const theme = usePreferences((s) => s.theme);
  useEffect(() => { loadPrefs(); }, [loadPrefs]);
  useEffect(() => { applyTheme(theme); }, [theme]);
  return React.createElement(QueryClientProvider, { client: getClient() }, children);
}

export { usePreferences } from "./preferences.store";
