import React, { useState } from 'react';
import type { ContextGap } from '../features/manuscript/context-analyzer.js';

export interface BridgeParagraph { text: string; wordCount: number; insertionPoint: { sceneId: string; offset: number; length: number }; contextCovered: string[]; styleMatch: number; alternatives?: string[] }

export function BridgeReview({
  gap,
  bridges,
  onSelect,
  onRefine,
}: {
  gap: ContextGap;
  bridges: BridgeParagraph[];
  onSelect: (bridge: BridgeParagraph) => void;
  onRefine: (bridge: BridgeParagraph, feedback: string) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  return (
    <div className="bridge-review">
      <h3>Bridge Paragraph Options</h3>
      <p className="gap-summary">Need: {gap.requiredInfo.facts.join('; ')}</p>
      {bridges.map((bridge, i) => (
        <div key={i} className={`bridge-option ${i === 0 ? 'recommended' : ''}`}>
          <div className="bridge-body">
            <p>{bridge.text}</p>
            <div className="meta">
              <span>{bridge.wordCount} words</span>
              <span>Style match: {(bridge.styleMatch * 100).toFixed(0)}%</span>
              <span>Coverage: {bridge.contextCovered.join(', ')}</span>
            </div>
          </div>
          <div className="actions">
            <button onClick={() => onSelect(bridge)}>Use this</button>
            <button onClick={() => { setEditingIndex(i); setEditText(bridge.text); }}>Refine</button>
          </div>
          {editingIndex === i && (
            <div className="edit-panel">
              <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={4} style={{ width: '100%' }} />
              <button onClick={() => { onRefine(bridge, editText); setEditingIndex(null); }}>Submit refinement</button>
              <button onClick={() => setEditingIndex(null)}>Cancel</button>
            </div>
          )}
        </div>
      ))}
      {bridges[0] && (
        <div className="bridge-metrics">
          <strong>Recommended</strong>: {bridges[0].wordCount} words · {(bridges[0].styleMatch * 100).toFixed(0)}% style · covers {bridges[0].contextCovered.length}
        </div>
      )}
    </div>
  );
}

export default BridgeReview;
