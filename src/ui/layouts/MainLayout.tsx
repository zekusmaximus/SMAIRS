import React, { PropsWithChildren } from "react";
import "../../styles/layout.css";
import "../../styles/animations.css";
import { DecisionBar } from "../components/DecisionBar";
import SceneNavigator from "@/ui/panels/SceneNavigator";
import CandidateGrid from "@/ui/panels/CandidateGrid";
import CompareDrawer from "@/ui/components/CompareDrawer";
import AnalysisDetails from "@/ui/panels/AnalysisDetails";
import JobTray from "@/ui/components/JobTray";

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

  return (
    <div className="main-grid">
  <DecisionBar onToggleCompare={() => { /* compare drawer opens when pinned via CompareDrawer */ }} />
      <Panel className="panel-left" title="Scene Navigator">
        <SceneNavigator />
      </Panel>
      <Panel className="panel-center" title="Candidates">
        <CandidateGrid />
      </Panel>
      <Panel className="panel-right" title="Analysis">
  <AnalysisDetails />
      </Panel>

  <CompareDrawer />
  <JobTray />
    </div>
  );
}

export default MainLayout;
