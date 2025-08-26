import React, { useMemo, useState } from "react";
import type { OpeningCandidate, OpeningAnalysis } from "@/types";
import { runPreflight } from "@/features/export/preflight";
import { generateBundle } from "@/features/export/bundleGenerator";
import { listenJobEvent } from "@/lib/events";

export interface ExportPanelProps { selectedCandidate?: OpeningCandidate; analysis?: OpeningAnalysis }

export function ExportPanel({ selectedCandidate, analysis }: ExportPanelProps) {
  type Format = 'docx'|'pdf'|'md';
  const [format, setFormat] = useState<Format>("docx");
  const [trackChanges, setTrackChanges] = useState(true);
  const [includeSynopsis, setIncludeSynopsis] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; step?: string }>({ percent: 0 });
  const [bundlePath, setBundlePath] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const checks = useMemo(() => runPreflight({ candidate: selectedCandidate, analysis }), [selectedCandidate, analysis]);
  const okToExport = checks.every(c => c.pass || !c.critical);

  async function onExport() {
    if (!selectedCandidate || !analysis) return;
    setBusy(true); setError(undefined); setBundlePath(undefined);
    const jobId = `export-${Date.now().toString(36)}`;
    const unlisten = await listenJobEvent(jobId, "progress", (p) => setProgress({ percent: p.percent, step: p.step }));
    try {
      const res = await generateBundle({ candidate: selectedCandidate, analysis, options: { format, includeSynopsis, trackChanges }, jobId });
      setBundlePath(res.outputPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false); unlisten();
    }
  }

  return (
    <div className="export-panel grid gap-3">
      <div>
        <h3 className="font-medium">Documents</h3>
        <div className="text-sm text-neutral-600">Opening, Synopsis, Query, Rationale</div>
      </div>
      <div>
        <h3 className="font-medium">Format</h3>
        <select value={format} onChange={(e) => {
          const v = e.target.value;
          if (v === 'docx' || v === 'pdf' || v === 'md') setFormat(v);
        }}>
          <option value="docx">DOCX</option>
          <option value="pdf">PDF</option>
          <option value="md">Markdown</option>
        </select>
      </div>
      <div>
        <h3 className="font-medium">Options</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeSynopsis} onChange={(e)=>setIncludeSynopsis(e.target.checked)} /> Include synopsis</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={trackChanges} onChange={(e)=>setTrackChanges(e.target.checked)} /> Track changes</label>
      </div>
      <div>
        <h3 className="font-medium">Preview</h3>
        <div className="text-sm text-neutral-600">Pre-flight: {checks.map(c => (c.pass ? '✓' : c.critical ? '✕' : '!')).join(' ')}</div>
      </div>
      <div className="flex items-center gap-2">
        <button className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50" disabled={!okToExport || busy} onClick={onExport}>Export</button>
        {busy && <span className="text-sm">{progress.percent}% {progress.step ? `(${progress.step})` : ''}</span>}
        {bundlePath && <a className="text-sm underline" href={bundlePath} download>Download</a>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
