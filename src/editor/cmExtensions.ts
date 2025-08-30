import { Extension, RangeSetBuilder, RangeSet, StateField, StateEffect } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

// Lightweight regex-based highlighters for manuscript text.
// - Dialogue lines: starting with a quote character
// - Character names: ALLCAPS words (screenplay style) or Capitalized standalone names

function regexHighlights() {
  const dialogueClass = Decoration.mark({ class: "cm-dialogue" });
  const nameClass = Decoration.mark({ class: "cm-character" });

  const plugin = ViewPlugin.fromClass(class {
    decorations;
    constructor(view: EditorView) { this.decorations = build(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
    }
  }, { decorations: v => v.decorations });

  function build(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const ranges: Array<{ from: number; to: number; decoration: Decoration }> = [];

    for (const { from, to } of view.visibleRanges) {
      const text = view.state.sliceDoc(from, to);

      // Dialogue: lines that start with quote
      const lineRegex = /(^|\n)(["""])([^\n]*)/g;
      let m: RegExpExecArray | null;
      while ((m = lineRegex.exec(text))) {
        const g1 = m[1] ?? "";
        const start = from + (m.index ?? 0) + g1.length;
        const end = start + (m[0]?.length ?? 0) - g1.length;
        ranges.push({ from: start, to: end, decoration: dialogueClass });
      }

      // Character names: simple heuristic
      const nameRegex = /\b([A-Z]{2,}(?:\s+[A-Z]{2,})*|[A-Z][a-z]+)\b/g;
      while ((m = nameRegex.exec(text))) {
        const s = from + m.index;
        const e = s + m[0].length;
        ranges.push({ from: s, to: e, decoration: nameClass });
      }
    }

    // Sort ranges by position before adding to builder
    ranges.sort((a, b) => a.from - b.from);

    // Add sorted ranges to builder
    for (const range of ranges) {
      builder.add(range.from, range.to, range.decoration);
    }

    return builder.finish();
  }
  return plugin;
}

// Virtual viewport management hint: reduce DOM complexity with a small line gap and minimal gutters.
function virtualViewportTuning(): Extension {
  return [
    EditorView.theme({
      ".cm-gutters": { display: "none" },
      ".cm-line": { padding: "0 4px" },
      ".cm-content": { padding: "8px" },
      ".cm-scroller": { contain: "strict" as unknown as string },
    }),
  ];
}

export function cmManuscriptExtensions(): Extension {
  return [
    regexHighlights(),
    virtualViewportTuning(),
  externalSearchHighlights(),
  ];
}

// Minimal CSS helpers (can be moved to stylesheet)
export const cmStyles = `
/* Base editor styles for dark theme */
.cm-editor {
  background: #1a1a1a !important;
  color: #e5e7eb !important;
  height: 100% !important;
}
.cm-content {
  color: #e5e7eb !important;
  background: #1a1a1a !important;
  min-height: 100% !important;
  padding: 12px !important;
}
.cm-editor .cm-scroller {
  background: #1a1a1a !important;
  color: #e5e7eb !important;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
}
.cm-focused {
  outline: none !important;
}
.cm-gutters {
  background: #2a2a2a;
  color: #9ca3af;
  border-right: 1px solid #374151;
}
.cm-activeLineGutter {
  background: #374151;
}
.cm-activeLine {
  background: #ffffff0a;
}
.cm-selectionBackground {
  background: #3b82f644 !important;
}
.cm-cursor {
  border-left: 2px solid #e5e7eb !important;
}
.cm-line {
  color: #e5e7eb !important;
}

/* Manuscript-specific highlighting */
.cm-dialogue { color: var(--cm-dialogue, #22d3ee); }
.cm-character { color: var(--cm-character, #a78bfa); font-weight: 500; }
.cm-scene-rule { --cm-rule: #7b7b7b55; }
.cm-search-hit { background: #ffd54a55; border-radius: 2px; box-shadow: inset 0 0 0 1px #ffcc00aa; }
`;

// External search highlight support: allows providing ranges from React side and preserves on edits.
const searchDeco = Decoration.mark({ class: "cm-search-hit" });
export type ExternalHighlight = { from: number; to: number };
const setExternalHighlightsEffect = StateEffect.define<RangeSet<Decoration>>();
export const externalSearchHighlightField = StateField.define<RangeSet<Decoration>>({
  create() { return RangeSet.empty; },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setExternalHighlightsEffect)) return e.value;
    }
    if (tr.docChanged) return value.map(tr.changes);
    return value;
  },
  provide: f => EditorView.decorations.from(f)
});

export function setExternalHighlights(view: EditorView, ranges: ExternalHighlight[]) {
  const builder = new RangeSetBuilder<Decoration>();
  for (const r of ranges) builder.add(r.from, r.to, searchDeco);
  const set = builder.finish();
  view.dispatch({ effects: setExternalHighlightsEffect.of(set) });
}

function externalSearchHighlights(): Extension {
  return [externalSearchHighlightField];
}
