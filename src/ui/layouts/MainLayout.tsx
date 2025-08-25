import React, { PropsWithChildren, useMemo, useState } from "react";
import "../../styles/layout.css";
import { DecisionBar } from "../components/DecisionBar";

type PanelProps = PropsWithChildren<{ className?: string; title?: string }>;
function Panel({ className, title, children }: PanelProps) {
  return (
    <section className={className}>
      {title ? <header className="panel-title">{title}</header> : null}
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function MainLayout() {
  const [compareOpen, setCompareOpen] = useState(false);
  const compareItems = 0; // Wire to store later; 0 means closed by default
  const isOpen = useMemo(() => compareOpen || compareItems > 0, [compareOpen, compareItems]);

  return (
    <div className="main-grid">
      <DecisionBar onToggleCompare={() => setCompareOpen((v) => !v)} />
      <Panel className="panel-left" title="Scene Navigator">
        {/* TODO: Navigator list */}
        <div className="placeholder">Scenes</div>
      </Panel>
      <Panel className="panel-center" title="Candidates">
        <div className="placeholder">Candidates</div>
      </Panel>
      <Panel className="panel-right" title="Analysis">
        <div className="placeholder">Analysis</div>
      </Panel>

      <div className={`compare-drawer ${isOpen ? "open" : ""}`}>
        <div className="compare-content">
          <strong>Compare Drawer</strong>
          <p>Pinned items appear here.</p>
        </div>
      </div>
    </div>
  );
}

export default MainLayout;
