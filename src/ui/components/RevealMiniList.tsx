import React, { useMemo, useState } from "react";

export interface RevealItem {
  id: string;
  description: string;
  met: boolean;
}

export interface RevealMiniListProps {
  items: RevealItem[];
  onClickReveal?: (id: string) => void;
}

export default function RevealMiniList({ items, onClickReveal }: RevealMiniListProps) {
  const [open, setOpen] = useState(true);
  const counts = useMemo(() => ({ met: items.filter(i => i.met).length, missing: items.filter(i => !i.met).length }), [items]);
  return (
    <div className="border-t border-neutral-200 dark:border-neutral-800">
      <button
        className="w-full text-left px-2 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-200 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span>Upstream Reveals</span>
        <span className="text-[10px] text-neutral-500">{counts.met} met • {counts.missing} missing</span>
      </button>
      {open ? (
        <div className="max-h-40 overflow-auto">
          {items.length === 0 ? (
            <div className="px-2 py-2 text-xs text-neutral-500">No reveals required.</div>
          ) : (
            <ul className="px-2 py-1 space-y-1">
              {items.map((it) => (
                <li key={it.id} className="text-xs flex items-start gap-2">
                  <span className="mt-0.5 select-none">{it.met ? "✅" : "⚠️"}</span>
                  <button
                    className={"text-left flex-1 hover:underline " + (it.met ? "text-neutral-700 dark:text-neutral-200" : "text-yellow-700 dark:text-yellow-300")}
                    onClick={() => onClickReveal?.(it.id)}
                  >
                    {it.description}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
