import { useAnalysisStore } from "@/stores/analysis.store";
import { useDecisionStore } from "@/stores/decision.store";
import { useManuscriptStore } from "@/stores/manuscript.store";
import { listVersions, createVersionSnapshot, loadVersionSnapshot, saveVersionSnapshot, deleteVersion as deleteVersionSnap, compareVersions as compareSnapshots, type VersionId, type VersionMetadata, type VersionSnapshot } from "./storage";

export type VersionSwitchOptions = { warnOnUnsaved?: boolean };

let currentVersionId: VersionId | undefined;

export function getCurrentVersionId() { return currentVersionId; }

export async function getVersions(): Promise<VersionMetadata[]> {
  return await listVersions();
}

export async function createBranch(name: string, parentId?: VersionId): Promise<VersionMetadata> {
  // snapshot current state
  const aStore = useAnalysisStore.getState();
  const dStore = useDecisionStore.getState();
  const mStore = useManuscriptStore.getState();
  const snapshot: Partial<VersionSnapshot> = {
  manuscript: mStore.manuscript ? (mStore.manuscript.rawText ?? undefined) : undefined,
    candidates: aStore.candidates,
    analyses: aStore.analyses,
    decisions: dStore.decisions,
  };
  const meta = await createVersionSnapshot({ name, parentId, snapshot });
  return meta;
}

export async function switchVersion(id: VersionId, opts?: VersionSwitchOptions): Promise<void> {
  // optional unsaved check: we only have local decisions persistence; analyses/candidates are in-memory
  if (opts?.warnOnUnsaved && (await hasUnsavedChanges())) {
  // Leave actual confirmation to the caller/UI, but expose a console hint
  console.warn("Switching versions with unsaved changes; consider promoting first.");
  }
  const snap = await loadVersionSnapshot(id);
  if (!snap) return;
  // Clear stores and reload from snapshot
  useAnalysisStore.setState({ candidates: snap.candidates ?? {}, analyses: snap.analyses ?? {}, selectedCandidateId: undefined, comparisonIds: [] });
  useDecisionStore.setState({ decisions: snap.decisions ?? {} });
  // Manuscript reload: if we only have text, import/segment would be needed; assume manuscript text in snap.manuscript path or content
  // For now, clear selection; UI should trigger a reload path if needed
  useManuscriptStore.setState({ selectedSceneId: undefined });
  currentVersionId = id;
}

export async function promoteToCurrent(id: VersionId): Promise<void> {
  // Save current state into the version id
  const aStore = useAnalysisStore.getState();
  const dStore = useDecisionStore.getState();
  const mStore = useManuscriptStore.getState();
  await saveVersionSnapshot(id, {
  manuscript: mStore.manuscript ? (mStore.manuscript.rawText ?? undefined) : undefined,
    candidates: aStore.candidates,
    analyses: aStore.analyses,
    decisions: dStore.decisions,
  });
  currentVersionId = id;
}

export async function deleteVersion(id: VersionId): Promise<boolean> {
  if (currentVersionId === id) return false;
  return await deleteVersionSnap(id);
}

export async function compareVersions(a: VersionId, b: VersionId) {
  return await compareSnapshots(a, b);
}

// --- Helpers --------------------------------------------------------------

export function getCurrentSnapshot(): Partial<VersionSnapshot> {
  const aStore = useAnalysisStore.getState();
  const dStore = useDecisionStore.getState();
  const mStore = useManuscriptStore.getState();
  return {
    manuscript: mStore.manuscript ? (mStore.manuscript.rawText ?? undefined) : undefined,
    candidates: aStore.candidates,
    analyses: aStore.analyses,
    decisions: dStore.decisions,
  };
}

function stableStringify(obj: unknown): string {
  const allKeys: string[] = [];
  JSON.stringify(obj, (k, v) => { allKeys.push(k); return v; });
  allKeys.sort();
  return JSON.stringify(obj, allKeys);
}

export async function hasUnsavedChanges(): Promise<boolean> {
  if (!currentVersionId) {
    // Treat any current state as unsaved if no version is active
    const cur = getCurrentSnapshot();
    const empty = stableStringify({});
    return stableStringify(cur.candidates ?? {}) !== empty || stableStringify(cur.analyses ?? {}) !== empty || stableStringify(cur.decisions ?? {}) !== empty;
  }
  const snap = await loadVersionSnapshot(currentVersionId);
  const cur = getCurrentSnapshot();
  const left = stableStringify({
    manuscript: cur.manuscript,
    candidates: cur.candidates,
    analyses: cur.analyses,
    decisions: cur.decisions,
  });
  const right = stableStringify({
    manuscript: snap?.manuscript,
    candidates: snap?.candidates,
    analyses: snap?.analyses,
    decisions: snap?.decisions,
  });
  return left !== right;
}

export async function mergeDecisions(fromId: VersionId, intoId: VersionId): Promise<void> {
  const from = await loadVersionSnapshot(fromId);
  const into = await loadVersionSnapshot(intoId);
  if (!into) return;
  const merged = { ...(into.decisions ?? {}), ...(from?.decisions ?? {}) };
  await saveVersionSnapshot(intoId, { decisions: merged });
}
