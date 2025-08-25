import type { OpeningAnalysis, OpeningCandidate, Decision } from "@/types";

export type VersionId = string;
export type VersionMetadata = {
  id: VersionId;
  name: string;
  createdAt: number;
  parentId?: VersionId;
  description?: string;
};

export type VersionSnapshot = {
  meta: VersionMetadata;
  manuscript?: string; // raw text
  candidates?: Record<string, OpeningCandidate>;
  analyses?: Record<string, OpeningAnalysis>;
  decisions?: Record<string, Decision>;
};

type VersionCompareResult = {
  a: VersionMetadata;
  b: VersionMetadata;
  metrics: {
    avgConfidenceDelta?: number;
    spoilerDelta?: number; // total spoilers delta
  };
  decisionsChanged: Array<{ id: string; a?: Decision; b?: Decision }>;
};

async function tauriInvoke<T = unknown>(cmd: string, args?: unknown): Promise<T | undefined> {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.__TAURI__ === "undefined") return undefined;
  const dynamicImport = new Function("s", "return import(s)") as (s: string) => Promise<unknown>;
  const { invoke } = (await dynamicImport("@tauri-apps/api/core")) as { invoke: (cmd: string, args?: unknown) => Promise<unknown> };
  return (await invoke(cmd, args)) as T;
}

// Local fallback storage for web/dev runs
const LS_KEY = "smairs.versions";
function loadLS(): { versions: VersionSnapshot[] } {
  if (typeof localStorage === "undefined") return { versions: [] };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { versions: [] };
    const parsed = JSON.parse(raw) as { versions?: VersionSnapshot[] };
    return { versions: parsed.versions ?? [] };
  } catch {
    return { versions: [] };
  }
}
function saveLS(versions: VersionSnapshot[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify({ versions }));
}

export async function listVersions(): Promise<VersionMetadata[]> {
  const res = await tauriInvoke<VersionMetadata[]>("version_list");
  if (res) return res;
  return loadLS().versions.map((v) => v.meta).sort((a, b) => a.createdAt - b.createdAt);
}

export async function createVersionSnapshot(input: { id?: VersionId; name: string; parentId?: VersionId; snapshot?: Partial<VersionSnapshot> }): Promise<VersionMetadata> {
  const id = input.id ?? `v${Date.now()}`;
  const payload = { id, name: input.name, parentId: input.parentId, snapshot: input.snapshot ?? {} };
  const created = await tauriInvoke<VersionMetadata>("version_create", payload);
  if (created) return created;
  // Fallback: write to localStorage
  const now = Date.now();
  const meta: VersionMetadata = { id, name: input.name, parentId: input.parentId, createdAt: now };
  const existing = loadLS().versions;
  const parent = input.parentId ? existing.find((v) => v.meta.id === input.parentId) : undefined;
  const newSnap: VersionSnapshot = {
    meta,
    manuscript: input.snapshot?.manuscript ?? parent?.manuscript,
    candidates: input.snapshot?.candidates ?? parent?.candidates ?? {},
    analyses: input.snapshot?.analyses ?? parent?.analyses ?? {},
    decisions: input.snapshot?.decisions ?? parent?.decisions ?? {},
  };
  existing.push(newSnap);
  saveLS(existing);
  return meta;
}

export async function saveVersionSnapshot(id: VersionId, snapshot: Partial<VersionSnapshot>): Promise<void> {
  const ok = await tauriInvoke<boolean>("version_save", { id, snapshot });
  if (ok !== undefined) return;
  const list = loadLS().versions;
  const idx = list.findIndex((v) => v.meta.id === id);
  if (idx >= 0) {
    const cur = list[idx]!;
    list[idx] = {
      meta: cur.meta,
      manuscript: snapshot.manuscript ?? cur.manuscript,
      candidates: snapshot.candidates ?? cur.candidates,
      analyses: snapshot.analyses ?? cur.analyses,
      decisions: snapshot.decisions ?? cur.decisions,
    };
  }
  saveLS(list);
}

export async function loadVersionSnapshot(id: VersionId): Promise<VersionSnapshot | undefined> {
  const res = await tauriInvoke<VersionSnapshot>("version_load", { id });
  if (res) return res;
  return loadLS().versions.find((v) => v.meta.id === id);
}

export async function deleteVersion(id: VersionId): Promise<boolean> {
  const ok = await tauriInvoke<boolean>("version_delete", { id });
  if (ok !== undefined) return !!ok;
  const list = loadLS().versions;
  const kept = list.filter((v) => v.meta.id !== id);
  saveLS(kept);
  return true;
}

export async function compareVersions(aId: VersionId, bId: VersionId): Promise<VersionCompareResult | undefined> {
  const res = await tauriInvoke<VersionCompareResult>("version_compare", { aId, bId });
  if (res) return res;
  // Fallback: compute locally
  const a = await loadVersionSnapshot(aId);
  const b = await loadVersionSnapshot(bId);
  if (!a || !b) return undefined;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : 0);
  const aAnal = Object.values(a.analyses ?? {});
  const bAnal = Object.values(b.analyses ?? {});
  const avgA = avg(aAnal.map((x) => x.confidence));
  const avgB = avg(bAnal.map((x) => x.confidence));
  const spoilerA = aAnal.reduce((p, c) => p + (c.spoilerCount ?? 0), 0);
  const spoilerB = bAnal.reduce((p, c) => p + (c.spoilerCount ?? 0), 0);
  const ids = new Set<string>([
    ...Object.keys(a.decisions ?? {}),
    ...Object.keys(b.decisions ?? {}),
  ]);
  const decisionsChanged: Array<{ id: string; a?: Decision; b?: Decision }> = [];
  for (const id of ids) {
    const dA = a.decisions?.[id];
    const dB = b.decisions?.[id];
    if (JSON.stringify(dA) !== JSON.stringify(dB)) decisionsChanged.push({ id, a: dA, b: dB });
  }
  return {
    a: a.meta,
    b: b.meta,
    metrics: { avgConfidenceDelta: avgB - avgA, spoilerDelta: spoilerB - spoilerA },
    decisionsChanged,
  };
}
