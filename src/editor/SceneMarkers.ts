import { Extension, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { useManuscriptStore } from "@/stores/manuscript.store";

// Scene boundary decorations. We query store once on init and update on selection changes via view plugin.
const toggleCollapse = StateEffect.define<string>(); // sceneId
const collapsedField = StateField.define<Set<string>>({
  create() { return new Set(); },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(toggleCollapse)) {
        const id = e.value as string;
        const next = new Set(value);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      }
    }
    return value;
  },
});

let lastView: EditorView | null = null;
export function sceneMarkers(): Extension {
  const plugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildDecorations(view); lastView = view; }
    update(u: ViewUpdate) {
      lastView = u.view;
      if (u.docChanged || u.viewportChanged) this.decorations = buildDecorations(u.view);
    }
  }, { decorations: v => v.decorations });

  return [collapsedField, plugin];
}

function buildDecorations(view: EditorView) {
  const { scenes } = useManuscriptStore.getState();
  const b = new RangeSetBuilder<Decoration>();
  const ranges = view.visibleRanges;
  const MARGIN = 50000; // 50k chars around viewport
  const collapsed = view.state.field(collapsedField, false) || new Set<string>();
  for (const s of scenes) {
    const pos = Math.min(s.startOffset, view.state.doc.length);
    // Include only if within any viewport range +/- margin
    let inView = false;
    for (const r of ranges) {
      if (pos >= Math.max(0, r.from - MARGIN) && pos <= r.to + MARGIN) { inView = true; break; }
    }
    if (!inView) continue;
    const hue = Math.max(0, Math.min(120, Math.round((s.dialogueRatio || 0) * 120)));
    b.add(pos, pos, Decoration.widget({ widget: new SceneRuleWidget(`${s.chapterId} • ${s.id}`, s.id, hue), side: -1 }));
    // Collapsed range from after rule to scene end
    if (collapsed.has(s.id)) {
      const end = Math.min(s.endOffset, view.state.doc.length);
      if (end > pos) {
        b.add(pos + 1, end, Decoration.replace({ block: true, widget: new CollapseWidget(s), isBlock: true as unknown as boolean }));
      }
    }
  }
  return b.finish();
}

class SceneRuleWidget extends WidgetType {
  label: string;
  sceneId: string;
  hue: number;
  constructor(label: string, sceneId: string, hue: number) { super(); this.label = label; this.sceneId = sceneId; this.hue = hue; }
  toDOM(): HTMLElement {
    const el = document.createElement("div");
    el.className = "cm-scene-rule";
    el.setAttribute("aria-label", `Scene boundary ${this.label}`);
    el.style.cssText = `border-top:1px dashed var(--cm-rule,#8883); margin:8px 0; height:0; position:relative; border-top-color: hsl(${this.hue} 60% 50% / 0.6);`;
    const tip = document.createElement("div");
    tip.textContent = this.label;
    tip.style.cssText = "position:absolute; top:-8px; left:0; font-size:11px; color:#888; background:transparent; padding:0 2px;";
    el.appendChild(tip);
    el.title = "Click to toggle collapse";
    el.style.cursor = "pointer";
    el.addEventListener("click", (ev) => {
      const v = lastView;
      if (v) v.dispatch({ effects: toggleCollapse.of(this.sceneId) });
      ev.preventDefault();
      ev.stopPropagation();
    });
    return el;
  }
  ignoreEvent(): boolean { return true; }
}

class CollapseWidget extends WidgetType {
  sceneLabel: string;
  lineCount: number;
  constructor(scene: { id: string; text: string }) {
    super();
    this.sceneLabel = scene.id;
    // Rough estimate; actual line count not needed
    this.lineCount = Math.max(1, Math.round((scene.text?.length || 0) / 80));
  }
  toDOM(): HTMLElement {
    const el = document.createElement("div");
    el.textContent = `▸ ${this.sceneLabel} (collapsed, ~${this.lineCount} lines)`;
    el.style.cssText = "color:#666; font-style:italic; padding:2px 4px;";
    return el;
  }
}
