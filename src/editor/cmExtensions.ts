import { Extension, RangeSetBuilder } from "@codemirror/state";
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
    for (const { from, to } of view.visibleRanges) {
      const text = view.state.sliceDoc(from, to);
      // Dialogue: lines that start with quote
      const lineRegex = /(^|\n)(["“”])([^\n]*)/g;
      let m: RegExpExecArray | null;
      while ((m = lineRegex.exec(text))) {
        const g1 = m[1] ?? "";
        const start = from + (m.index ?? 0) + g1.length;
        const end = start + (m[0]?.length ?? 0) - g1.length;
        builder.add(start, end, dialogueClass);
      }
      // Character names: simple heuristic
      const nameRegex = /\b([A-Z]{2,}(?:\s+[A-Z]{2,})*|[A-Z][a-z]+)\b/g;
      while ((m = nameRegex.exec(text))) {
        const s = from + m.index;
        const e = s + m[0].length;
        builder.add(s, e, nameClass);
      }
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
  ];
}

// Minimal CSS helpers (can be moved to stylesheet)
export const cmStyles = `
.cm-dialogue { color: var(--cm-dialogue, #0c7); }
.cm-character { color: var(--cm-character, #79c); font-weight: 500; }
.cm-scene-rule { --cm-rule: #7b7b7b55; }
`;
