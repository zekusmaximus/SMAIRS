import React, { useMemo, useState } from "react";
import { useAnalysisStore } from "@/stores/analysis.store";
import { runPreflight } from "@/features/export/preflight";
import { generateBundle } from "@/features/export/bundleGenerator";
import { listenJobEvent } from "@/lib/events";

type Format = "docx" | "pdf" | "md";

export default function ExportDashboard() {
  const { selectedCandidateId, analyses, candidates } = useAnalysisStore();
  const [format, setFormat] = useState<Format>("docx");
  const [includeSynopsis, setIncludeSynopsis] = useState(true);
  const [trackChanges, setTrackChanges] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; step?: string }>({ percent: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [bundlePath, setBundlePath] = useState<string | undefined>(undefined);

  const candidate = selectedCandidateId ? candidates[selectedCandidateId] : undefined;
  const analysis = selectedCandidateId ? analyses[selectedCandidateId] : undefined;

  const checks = useMemo(() => runPreflight({ candidate, analysis }), [candidate, analysis]);
  const allPass = checks.every((c) => c.pass || !c.critical);

  async function onExport() {
    if (!candidate || !analysis) return;
    setBusy(true); setErrors([]); setProgress({ percent: 1, step: "prepare" }); setBundlePath(undefined);
    const jobId = `export-${Date.now().toString(36)}`;
    const unlisten = await listenJobEvent(jobId, "progress", (p) => setProgress({ percent: p.percent, step: p.step }));
    try {
      const result = await generateBundle({
        candidate,
        analysis,
        options: { format, includeSynopsis, trackChanges },
        jobId,
      });
      setBundlePath(result.outputPath);
      setProgress({ percent: 100, step: "complete" });
    } catch (e) {
      setErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
      unlisten();
    }
  }

  return (
    <div className="p-4 w-[680px] max-w-full">
      <h2 className="text-lg font-semibold mb-3">Export Dashboard</h2>
      {!candidate || !analysis ? (
        <div className="text-sm text-neutral-600">Select a candidate to export.</div>
      ) : (
        <>
          <section className="mb-4">
            <h3 className="font-medium mb-2">Pre-flight Checklist</h3>
            <ul className="space-y-1">
              {checks.map((c) => (
                <li key={c.key} className="text-sm flex items-start gap-2">
                  <span className={c.pass ? "text-green-600" : c.critical ? "text-red-600" : "text-amber-600"}>
                    {c.pass ? "✓" : c.critical ? "✕" : "!"}
                  </span>
                  <div>
                    <div className="font-medium">{c.label}</div>
                    {!c.pass && c.message && (
                      <div className="text-neutral-600">{c.message}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium mb-2">Formats</h3>
              <div className="flex items-center gap-2 text-sm">
                {(["docx", "pdf", "md"] as Format[]).map((f) => (
                  <label key={f} className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" name="fmt" value={f} checked={format === f} onChange={() => setFormat(f)} />
                    {f.toUpperCase()}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-medium mb-2">Options</h3>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeSynopsis} onChange={(e) => setIncludeSynopsis(e.target.checked)} />
                Include synopsis
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={trackChanges} onChange={(e) => setTrackChanges(e.target.checked)} />
                Track changes
              </label>
            </div>
          </section>

          {errors.length > 0 && (
            <div className="mb-3 text-sm text-red-600">
              {errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          <section className="flex items-center justify-between">
            <div className="text-sm text-neutral-600">
              {busy ? (
                <span>
                  Exporting… {progress.percent}% {progress.step ? `(${progress.step})` : ""}
                </span>
              ) : bundlePath ? (
                <span>Ready: {bundlePath}</span>
              ) : (
                <span>Idle</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
                disabled={!allPass || busy}
                title={!allPass ? "Resolve checklist issues before exporting" : "Export"}
                onClick={onExport}
              >
                Export
              </button>
              {bundlePath && (
                <a className="px-3 py-1.5 rounded bg-neutral-200 dark:bg-neutral-800" href={bundlePath} download>
                  Download
                </a>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
