import React, { PropsWithChildren, Suspense, useEffect, useRef, useState } from "react";
import "../../styles/layout.css";
import "../../styles/animations.css";
import "@/ui/themes/highContrast.css";
import { DecisionBar } from "../components/DecisionBar";
import ErrorBoundary from "@/ui/components/ErrorBoundary";
import KeyboardHelp from "@/ui/components/KeyboardHelp";
// React imported above
const SceneNavigator = React.lazy(() => import("@/ui/panels/SceneNavigator"));
const CandidateGrid = React.lazy(() => import("@/ui/panels/CandidateGrid"));
const CompareDrawer = React.lazy(() => import("@/ui/components/CompareDrawer"));
const AnalysisDetails = React.lazy(() => import("@/ui/panels/AnalysisDetails"));
const JobTray = React.lazy(() => import("@/ui/components/JobTray"));
const DbHarness = React.lazy(() => import("@/ui/components/DbHarness"));

type PanelProps = PropsWithChildren<{ className?: string; title?: string }>;
function Panel({ className, title, children }: PanelProps) {
  return (
    <section className={className} role="region" aria-label={title || undefined}>
      {title ? <header className="panel-title" aria-level={2} role="heading">{title}</header> : null}
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function MainLayout() {
  const [helpOpen, setHelpOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLElement | null>(null);
  const centerRef = useRef<HTMLElement | null>(null);
  const rightRef = useRef<HTMLElement | null>(null);
  const decisionRef = useRef<HTMLDivElement | null>(null);

  // Global keyboard shortcuts and high-contrast toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Show help
      if (e.key === "?" || (e.shiftKey && e.key === "/")) { e.preventDefault(); setHelpOpen(true); return; }
  // High contrast: Cmd/Ctrl + Alt + C
  if (((e.metaKey || e.ctrlKey) && e.altKey) && (e.key.toLowerCase() === "c")) {
        e.preventDefault();
        document.documentElement.classList.toggle("high-contrast");
        return;
      }
      // Panel focus 1-3
      if (e.key >= "1" && e.key <= "3") {
        const k = e.key;
        if (k === "1") (leftRef.current as HTMLElement | null)?.focus?.();
        else if (k === "2") (centerRef.current as HTMLElement | null)?.focus?.();
        else if (k === "3") (rightRef.current as HTMLElement | null)?.focus?.();
        return;
      }
      // Global toolbar shortcuts
      if (!(e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable=true]")) {
        const bar = decisionRef.current;
        if (!bar) return;
        const clickBtn = (aria: string) => (bar.querySelector(`button[aria-label="${aria}"]`) as HTMLButtonElement | null)?.click();
        if (e.key.toLowerCase() === "g") { e.preventDefault(); clickBtn("Generate"); return; }
        if (e.key.toLowerCase() === "c") { e.preventDefault(); clickBtn("Compare"); return; }
        if (e.key.toLowerCase() === "e") { e.preventDefault(); clickBtn("Export"); return; }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={rootRef} className="main-grid" role="main" aria-label="SMAIRS Main" tabIndex={-1}>
      <div ref={decisionRef as unknown as React.RefObject<HTMLDivElement>}>
        <DecisionBar onToggleCompare={() => { /* compare drawer opens when pinned via CompareDrawer */ }} />
      </div>
      <Panel className="panel-left" title="Scene Navigator">
        <ErrorBoundary label="Scene Navigator">
          <Suspense fallback={<div className="p-3 text-sm text-neutral-500">Loading navigator…</div>}>
            <div ref={leftRef as unknown as React.RefObject<HTMLDivElement>} tabIndex={0} aria-label="Scene Navigator Content">
              <SceneNavigator />
            </div>
          </Suspense>
        </ErrorBoundary>
      </Panel>
      <Panel className="panel-center" title="Candidates">
        <ErrorBoundary label="Candidates">
          <Suspense fallback={<div className="p-3 text-sm text-neutral-500">Loading candidates…</div>}>
            <div ref={centerRef as unknown as React.RefObject<HTMLDivElement>} tabIndex={0} aria-label="Candidates Content">
              <CandidateGrid />
            </div>
          </Suspense>
        </ErrorBoundary>
      </Panel>
      <Panel className="panel-right" title="Analysis">
        <ErrorBoundary label="Analysis">
          <Suspense fallback={<div className="p-3 text-sm text-neutral-500">Loading analysis…</div>}>
            <div ref={rightRef as unknown as React.RefObject<HTMLDivElement>} tabIndex={0} aria-label="Analysis Content">
              <AnalysisDetails />
            </div>
          </Suspense>
        </ErrorBoundary>
      </Panel>

      <Suspense fallback={null}>
        <CompareDrawer />
      </Suspense>
      <Suspense fallback={null}>
        <JobTray />
      </Suspense>

      <Suspense fallback={null}>
        <DbHarness />
      </Suspense>

      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

export default MainLayout;
