import React, { useMemo, useState } from "react";

export interface SceneRowData {
  id: string;
  name: string;
  hookScore?: number; // 0..1
  actionDensity?: number; // 0..1
  mysteryQuotient?: number; // 0..1
  violations?: { level: "critical" | "moderate"; message?: string }[];
  characters?: string[];
  excerpt?: string;
}

export interface SceneRowProps {
  data: SceneRowData;
  index: number;
  isActive?: boolean;
  onClick?: (id: string) => void;
  highlight?: string; // search term to highlight
}

function Bar({ value = 0, color }: { value?: number; color: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((value || 0) * 100)));
  return (
    <div className="h-1.5 w-full bg-neutral-200 dark:bg-neutral-800 rounded">
      <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function highlightText(text: string, query?: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <mark className="bg-yellow-200 dark:bg-yellow-700 px-0.5 rounded-sm">{match}</mark>
      {after}
    </>
  );
}

function SceneRowImpl({ data, index, isActive, onClick, highlight }: SceneRowProps) {
  const [open, setOpen] = useState(false);
  const vio = data.violations || [];
  const hasCritical = vio.some(v => v.level === "critical");
  const hasModerate = vio.some(v => v.level === "moderate");
  const badges = useMemo(() => (data.characters || []).slice(0, 4), [data.characters]);

  return (
    <div
      className={
        "px-2 py-2 border-b border-neutral-200 dark:border-neutral-800 focus:outline-none " +
        (isActive ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-neutral-50 dark:hover:bg-neutral-900/40")
      }
      role="listitem"
      aria-selected={isActive}
      aria-label={`Scene ${data.name}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(data.id); }
      }}
      onClick={() => onClick?.(data.id)}
    >
      <div className="flex items-center gap-2">
        <div className="text-xs text-neutral-500 w-8 select-none">{String(index + 1).padStart(2, "0")}</div>
        <div className="flex-1 font-medium text-sm truncate">
          {highlightText(data.name, highlight)}
        </div>
        <div className="flex items-center gap-1 text-lg select-none">
          {hasCritical ? <span title="Critical issues">🔴</span> : null}
          {!hasCritical && hasModerate ? <span title="Moderate issues">🟡</span> : null}
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Bar value={data.hookScore} color="#2563eb" />
        <Bar value={data.actionDensity} color="#16a34a" />
        <Bar value={data.mysteryQuotient} color="#dc2626" />
      </div>
      {badges.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {badges.map((c) => (
            <span key={c} className="text-[10px] px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200">
              {c}
            </span>
          ))}
        </div>
      ) : null}
      {data.excerpt ? (
        <button
          className="mt-1 text-xs text-blue-600 hover:underline"
          aria-expanded={open}
          aria-controls={`scene-excerpt-${data.id}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          {open ? "Hide excerpt" : "Show excerpt"}
        </button>
      ) : null}
      {open && data.excerpt ? (
        <div id={`scene-excerpt-${data.id}`} className="mt-1 text-xs text-neutral-700 dark:text-neutral-300 line-clamp-6 whitespace-pre-wrap">
          {data.excerpt}
        </div>
      ) : null}
    </div>
  );
}

const SceneRow = React.memo(SceneRowImpl, (prev, next) => {
  return (
    prev.isActive === next.isActive &&
    prev.highlight === next.highlight &&
    prev.index === next.index &&
    prev.data === next.data
  );
});

export default SceneRow;
