import React from "react";

export interface FilterChipsProps<T extends string> {
  options: { label: string; value: T }[];
  selected: T[];
  onChange: (next: T[]) => void;
  className?: string;
}

export default function FilterChips<T extends string>({ options, selected, onChange, className }: FilterChipsProps<T>) {
  const toggle = (val: T) => {
    const set = new Set(selected);
    if (set.has(val)) set.delete(val);
    else set.add(val);
    onChange(Array.from(set));
  };
  return (
    <div className={"flex flex-wrap gap-1 " + (className || "")}
      role="group" aria-label="Scene filters">
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => toggle(opt.value)}
            className={
              "px-2 py-1 rounded-md border text-xs select-none transition-colors " +
              (active ? "bg-blue-600 text-white border-blue-700" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-700")
            }
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
