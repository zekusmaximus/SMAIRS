import React, { useMemo, useState } from "react";
import type { OpeningAnalysis } from "@/stores/analysis.store";

export interface EditsTabProps { analysis?: OpeningAnalysis; candidateId: string }

type EditItem = { id: string; type: 'insert' | 'delete' | 'replace'; text: string; accepted: boolean };

export default function EditsTab({ analysis }: EditsTabProps) {
  const [edits, setEdits] = useState<EditItem[]>(() => {
    // synthesize small edit list based on burden
    const n = Math.round((analysis?.editBurdenPercent || 0) * 5);
    return Array.from({ length: n }).map((_, i) => ({ id: `${analysis?.id}-edit-${i+1}`, type: i % 3 === 0 ? 'insert' : i % 3 === 1 ? 'delete' : 'replace', text: `Edit ${i+1} …`, accepted: true }));
  });

  const totalBurden = useMemo(() => Math.round((analysis?.editBurdenPercent || 0) * 100), [analysis]);

  return (
    <div className="p-3 space-y-3">
      <div className="font-semibold text-sm">Total burden: {totalBurden}%</div>
      {edits.length === 0 ? (
        <div className="text-sm text-neutral-500">No edits proposed.</div>
      ) : (
        <ul className="space-y-2">
          {edits.map((e) => (
            <li key={e.id} className="p-2 rounded border border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <div className="text-sm">[{e.type}] {e.text}</div>
                <label className="inline-flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={e.accepted} onChange={(ev)=> setEdits(edits.map(x => x.id===e.id ? { ...x, accepted: ev.target.checked } : x))} />
                  Accept
                </label>
              </div>
              <div className="mt-1 text-xs text-neutral-500">Diff: +10 / -3</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
