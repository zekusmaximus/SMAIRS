import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

async function listVersions(): Promise<string[]> {
  try {
    const mod = (await import("@tauri-apps/api")) as unknown as { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
    if (typeof mod.invoke === "function") {
      const res = await mod.invoke("list_versions", {});
      return res as string[];
    }
  } catch {
    // not running in Tauri; fall back to mock
  }
  // fallback mock
  return ["v1", "v2", "current"];
}

async function promoteVersion(ver: string): Promise<boolean> {
  try {
    const mod = (await import("@tauri-apps/api")) as unknown as { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
    if (typeof mod.invoke === "function") {
      await mod.invoke("promote_version", { version: ver });
      return true;
    }
  } catch {
    // not running in Tauri; treat as success in mock mode
  }
  return true;
}

export function VersionSelector() {
  const { data: versions = [], isLoading } = useQuery({ queryKey: ["versions"], queryFn: listVersions });
  const [current, setCurrent] = React.useState<string>("current");
  const promote = useMutation({ mutationFn: promoteVersion });

  // const nonCurrent = versions.filter((v) => v !== current);

  return (
    <div className="version-selector">
      <select value={current} onChange={(e) => setCurrent(e.target.value)} disabled={isLoading}>
        {versions.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      {current !== "current" && (
        <button
          className="btn promote"
          onClick={() => promote.mutate(current)}
          disabled={promote.isPending}
          title="Promote to current"
        >
          Promote
        </button>
      )}
    </div>
  );
}

export default VersionSelector;
