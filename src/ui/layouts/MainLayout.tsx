import React, { PropsWithChildren, useEffect, useRef, useState } from "react";
import "../../styles/layout.css";
import "../../styles/animations.css";
import "@/ui/themes/highContrast.css";
import { DecisionBar } from "../components/DecisionBar";
import { SectionErrorBoundary, ComponentErrorBoundary } from "@/ui/components/ErrorBoundary";
import { AsyncWrapper, LazyComponentWrapper } from "@/ui/components/AsyncWrapper";
import { ManuscriptLoadError } from "@/ui/components/ManuscriptLoadError";
import { useManuscriptStore } from "@/stores/manuscript.store";
import KeyboardHelp from "@/ui/components/KeyboardHelp";
import OverlayStack from "@/ui/components/OverlayStack";
import { OperationStatus } from "@/ui/components/OperationStatus";
// React imported above
const SceneNavigator = React.lazy(() => import("@/ui/panels/SceneNavigator"));
const CompareDrawer = React.lazy(() => import("@/ui/components/CompareDrawer"));
const AnalysisDetails = React.lazy(() => import("@/ui/panels/AnalysisDetails"));
const SearchPanel = React.lazy(() => import("@/ui/panels/SearchPanel"));
const ManuscriptEditor = React.lazy(() => import("@/editor/Editor"));
const JobTray = React.lazy(() => import("@/ui/components/JobTray"));
const DbHarness = React.lazy(() => import("@/ui/components/DbHarness"));
const LLMMonitorWidget = React.lazy(() => import("@/components/LLMMonitorWidget"));

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

  // Get manuscript loading state from store
  const { loadingState } = useManuscriptStore();

  // Global keyboard shortcuts and high-contrast toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // Required shortcuts
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); (document.querySelector('[data-action="open-manuscript"]') as HTMLButtonElement|null)?.click?.(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); (document.querySelector('[data-action="save"]') as HTMLButtonElement|null)?.click?.(); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); (document.querySelector('button[aria-label="Export"]') as HTMLButtonElement|null)?.click?.(); return; }
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); (document.querySelector('input[placeholder^="Search"]') as HTMLInputElement|null)?.focus?.(); return; }
      if (mod && e.key === '/') { e.preventDefault(); setHelpOpen(true); return; }
      if (e.key === 'Escape') { const openDialog = document.querySelector('[role="dialog"] .[aria-label="Close"], [role="dialog"] [data-close]') as HTMLButtonElement | null; openDialog?.click?.(); }
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
        <LazyComponentWrapper label="Scene Navigator" skeletonLines={5}>
            <div ref={leftRef as unknown as React.RefObject<HTMLDivElement>} tabIndex={0} aria-label="Scene Navigator Content">
              <SceneNavigator />
            </div>
        </LazyComponentWrapper>
      </Panel>
      <Panel className="panel-center" title="Manuscript">
        <SectionErrorBoundary label="Manuscript Editor">
          {loadingState === 'error' ? (
            <ManuscriptLoadError />
          ) : (
            <AsyncWrapper
              errorBoundary="none"
              loadingMessage="Loading manuscript editor..."
              fallback={
                <div className="flex items-center justify-center" style={{ height: "60vh" }}>
                  <div className="space-y-4 text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                    <p className="text-sm text-neutral-500">Loading editor...</p>
                  </div>
                </div>
              }
            >
              <div ref={centerRef as unknown as React.RefObject<HTMLDivElement>} tabIndex={0} aria-label="Manuscript Editor">
                <div style={{ height: "60vh", background: "#1a1a1a", minHeight: "400px" }}>
                  <ManuscriptEditor />
                </div>
              </div>
            </AsyncWrapper>
          )}
        </SectionErrorBoundary>
      </Panel>
      <Panel className="panel-right" title="Search & Analysis">
        <div className="space-y-4">
          <ComponentErrorBoundary label="Search Panel">
            <AsyncWrapper
              errorBoundary="none"
              loadingMessage="Loading search..."
              fallback={
                <div className="p-4 space-y-2">
                  <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
                </div>
              }
            >
              <div ref={rightRef as unknown as React.RefObject<HTMLDivElement>} tabIndex={0} aria-label="Search Content">
                <SearchPanel />
              </div>
            </AsyncWrapper>
          </ComponentErrorBoundary>

          <ComponentErrorBoundary label="Analysis Details">
            <AsyncWrapper
              errorBoundary="none"
              loadingMessage="Loading analysis..."
              fallback={
                <div className="p-4 space-y-3">
                  <div className="h-6 bg-gray-200 rounded animate-pulse w-2/3"></div>
                  <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-4 bg-gray-200 rounded animate-pulse w-4/5"></div>
                  <div className="h-4 bg-gray-200 rounded animate-pulse w-3/5"></div>
                </div>
              }
            >
              <div aria-label="Analysis Content" data-testid="analysis-details">
                <AnalysisDetails />
              </div>
            </AsyncWrapper>
          </ComponentErrorBoundary>
        </div>
      </Panel>

      <ComponentErrorBoundary label="Compare Drawer">
        <AsyncWrapper errorBoundary="none" fallback={null}>
          <CompareDrawer />
        </AsyncWrapper>
      </ComponentErrorBoundary>

      <ComponentErrorBoundary label="Overlay Components">
        <AsyncWrapper errorBoundary="none" fallback={null}>
          <OverlayStack>
            <LLMMonitorWidget />
            <DbHarness />
            <JobTray compact />
            <OperationStatus compact showQueue />
          </OverlayStack>
        </AsyncWrapper>
      </ComponentErrorBoundary>

      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

export default MainLayout;
