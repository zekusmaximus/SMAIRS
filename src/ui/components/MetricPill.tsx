import React from "react";

export type MetricType = "score" | "count" | "percent";

function colorFor(type: MetricType, value: number): string {
  // Map to semantic colors: good (green), moderate (amber), poor (red)
  const v = isFinite(value) ? value : 0;
  if (type === "score" || type === "percent") {
    if (v >= 0.75) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
    if (v >= 0.5) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  }
  // count: smaller count is often better for spoilers/burden; invert
  if (v <= 1) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
  if (v <= 3) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
}

export interface MetricPillProps {
  label: string;
  value: number;
  type: MetricType;
  className?: string;
}

export default function MetricPill({ label, value, type, className }: MetricPillProps) {
  const color = colorFor(type, value);
  const display = type === "percent" || type === "score" ? `${Math.round(value * 100)}%` : String(value);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${color} ${className || ""}`}>
      <span className="opacity-70">{label}</span>
      <span>{display}</span>
    </span>
  );
}
