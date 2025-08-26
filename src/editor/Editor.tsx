import React, { useEffect, useMemo, useRef } from "react";
import { EditorState, Compartment, Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { search, openSearchPanel, replaceAll, setSearchQuery, SearchQuery } from "@codemirror/search";
import { useManuscriptStore } from "@/stores/manuscript.store";
import { sceneMarkers } from "@/editor/SceneMarkers";
import { cmManuscriptExtensions, cmStyles, setExternalHighlights } from "@/editor/cmExtensions";
import { usePreferences } from "@/stores/preferences.store";
import { markStart, markEnd, record, trackFrame, snapshotMemory } from "@/lib/metrics";

export type ManuscriptEditorProps = {
  initialText?: string;
  onChange?: (text: string) => void;
  selectedSceneId?: string;
};

export function ManuscriptEditor({ initialText, onChange, selectedSceneId }: ManuscriptEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const debounceRef = useRef<number | null>(null);

  const { fullText, updateText, jumpToScene, getSceneText } = useManuscriptStore();

  const baseText = initialText ?? fullText ?? "";
  const fontSize = usePreferences((s) => s.editorFontSize);

  // Lazy highlight style to reduce initial cost
  const lazyHighlight = useMemo<Extension>(() => syntaxHighlighting(defaultHighlightStyle, { fallback: true }), []);

  // Compartments allow dynamic reconfiguration
  const themeComp = useRef(new Compartment());
  const markersComp = useRef(new Compartment());
  const searchComp = useRef(new Compartment());

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;
    // Inject styles once
    if (!document.getElementById("cm-manuscript-styles")) {
      const style = document.createElement("style");
      style.id = "cm-manuscript-styles";
      style.textContent = cmStyles;
      document.head.appendChild(style);
    }
    markStart("editor-init-ms");
    const state = EditorState.create({
      doc: baseText,
      extensions: [
        cmManuscriptExtensions(),
        themeComp.current.of(EditorView.theme({
          ".cm-content": { fontFamily: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif", fontSize: `${fontSize}px`, lineHeight: 1.6 },
          ".cm-scroller": { overscrollBehavior: "contain" },
        })),
        markersComp.current.of(sceneMarkers()),
        searchComp.current.of([search()]),
        keymap.of([
          { key: "Mod-f", run: (view) => { openSearchPanel(view); return true; } },
          { key: "Mod-Shift-f", run: (view) => { openSearchPanel(view); return true; } },
          { key: "F3", run: (view) => { openSearchPanel(view); return true; } },
        ]),
        lazyHighlight,
        placeholder("Loading manuscript…"),
        EditorView.updateListener.of((vu) => {
          if (vu.docChanged) {
            const text = vu.state.doc.toString();
            // Debounce to avoid excessive persistence and analysis churn
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
            debounceRef.current = window.setTimeout(() => {
              updateText(text);
              onChange?.(text);
            }, 200) as unknown as number;
          }
          if (vu.viewportChanged) trackFrame();
        }),
        EditorView.domEventHandlers({
          scroll: () => trackFrame(),
        }),
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    const dt = markEnd("editor-init-ms");
    record("first-render-ms", dt, "ms", { scope: "editor" });
    snapshotMemory();

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  // React to font size changes live
  useEffect(() => {
    const view = viewRef.current; if (!view) return;
    view.dispatch({ effects: themeComp.current.reconfigure(EditorView.theme({
      ".cm-content": { fontFamily: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif", fontSize: `${fontSize}px`, lineHeight: 1.6 },
      ".cm-scroller": { overscrollBehavior: "contain" },
    })) });
  }, [fontSize]);

  // Keep external text in sync if it is provided and differs substantially (e.g., load from DB)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (baseText && baseText !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: baseText } });
    }
  }, [baseText]);

  // Jump to selected scene when updated
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !selectedSceneId) return;
    const offset = jumpToScene(selectedSceneId);
    if (offset >= 0) {
      const pos = Math.min(offset, view.state.doc.length);
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    }
  }, [selectedSceneId, jumpToScene]);

  // Imperative search API for external callers
  const api = useMemo(() => ({
    find: (q: string) => {
      const view = viewRef.current;
      if (!view) return 0;
      const t0 = performance.now();
      const query = new SearchQuery({ search: q, caseSensitive: false, regexp: false, wholeWord: false });
    view.dispatch({ effects: setSearchQuery.of(query) });
    // Count at least one match quickly
      const cur = query.getCursor(view.state, 0);
      const first = cur.next();
      const count = (first && (first as { done?: boolean }).done) ? 0 : 1;
      const dt = performance.now() - t0;
      record("search-ms", dt, "ms", { q });
      return count;
    },
    scrollTo: (offset: number) => {
      const view = viewRef.current; if (!view) return;
      const pos = Math.max(0, Math.min(offset, view.state.doc.length));
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    },
    setHighlights: (ranges: Array<{ from: number; to: number }>) => {
      const view = viewRef.current; if (!view) return 0;
      setExternalHighlights(view, ranges);
      return ranges.length;
    },
    clearHighlights: () => {
      const view = viewRef.current; if (!view) return;
      setExternalHighlights(view, []);
    },
    replaceAll: (from: string, to: string) => {
      const view = viewRef.current;
      if (!view) return;
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: from, replace: to })) });
    replaceAll(view);
    },
    getSceneText: (sceneId: string) => getSceneText(sceneId),
  }), [getSceneText]);
  // Expose API for debugging (typed in global.d.ts)
  (window as unknown as { manuscriptEditor?: typeof api }).manuscriptEditor = api;

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} aria-label="Manuscript Editor" />;
}

export default ManuscriptEditor;
