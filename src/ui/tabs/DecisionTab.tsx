import React, { useEffect, useState } from "react";
import { useDecisionStore } from "@/stores/decision.store";
import type { OpeningAnalysis } from "@/stores/analysis.store";

export interface DecisionTabProps {
  candidateId: string;
  analysis?: OpeningAnalysis;
}

type Verdict = "Accept" | "Revise" | "Reject";

export default function DecisionTab({ candidateId, analysis }: DecisionTabProps) {
  const { getDecision, setDecision } = useDecisionStore();
  const existing = getDecision(candidateId);
  const [verdict, setVerdict] = useState<Verdict>(existing?.verdict || "Revise");
  const [why, setWhy] = useState<string[]>(existing?.whyItWorks || []);
  const [risk, setRisk] = useState<string>(existing?.riskNotes || "");

  // Pre-populate from analysis rationale if empty
  useEffect(() => {
    if (!analysis) return;
    if (why.length === 0 && analysis.rationale) {
      const seeds = analysis.rationale.split(/[.;\n]/).map(s => s.trim()).filter(Boolean).slice(0, 3);
      if (seeds.length) setWhy(seeds);
    }
  }, [analysis, why.length]);

  // Auto-save on changes
  useEffect(() => {
    setDecision(candidateId, { verdict, whyItWorks: why.slice(0,3), riskNotes: risk || undefined });
  }, [candidateId, setDecision, verdict, why, risk]);

  const canAdd = why.length < 3;

  return (
    <div className="p-3 space-y-4">
      <div>
        <div className="font-semibold text-sm mb-1">Decision</div>
        <div className="flex items-center gap-3">
          {(["Accept","Revise","Reject"] as Verdict[]).map(v => (
            <label key={v} className="inline-flex items-center gap-1">
              <input type="radio" name="verdict" value={v} checked={verdict===v} onChange={()=>setVerdict(v)} />
              <span className="text-sm">{v}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="font-semibold text-sm mb-1">Why it works (1–3)</div>
        <ul className="space-y-2">
          {why.map((w, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="mt-1">•</span>
              <input
                className="flex-1 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700"
                value={w}
                onChange={(e)=>{
                  const next = why.slice();
                  next[idx] = e.target.value;
                  setWhy(next);
                }}
              />
              <button className="text-xs text-red-600" onClick={()=> setWhy(why.filter((_,i)=>i!==idx))}>Remove</button>
            </li>
          ))}
        </ul>
        {canAdd ? (
          <button
            className="mt-2 text-xs text-blue-600 hover:underline"
            onClick={()=> setWhy([...why, ""])}
          >
            Add bullet
          </button>
        ) : null}
      </div>

      <div>
        <div className="font-semibold text-sm mb-1">Risk notes (optional)</div>
        <textarea
          className="w-full min-h-[80px] px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700"
          value={risk}
          onChange={(e)=> setRisk(e.target.value)}
          placeholder="Potential risks or caveats…"
        />
      </div>
    </div>
  );
}
